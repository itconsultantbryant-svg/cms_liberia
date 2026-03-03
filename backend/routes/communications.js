const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { createNotification } = require('./notifications');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/communications');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get sender/recipient name helper
async function getUserName(userId, userType) {
  if (userType === 'sub_user') {
    const subUser = await db.getAsync('SELECT firstname, lastname FROM sub_users WHERE id = ?', [userId]);
    return subUser ? `${subUser.firstname} ${subUser.lastname}` : 'Unknown';
  } else {
    const branch = await db.getAsync('SELECT branchname FROM branches WHERE id = ?', [userId]);
    return branch ? branch.branchname : 'Unknown';
  }
}

// Get user role helper
async function getUserRole(userId, userType) {
  if (userType === 'branch') {
    const RoleManager = require('../utils/roles');
    const primaryRole = await RoleManager.getPrimaryRole(userId, 'branch');
    return primaryRole ? primaryRole.role_name : null;
  }
  return null;
}

// Create a new communication
router.post('/', authMiddleware, attachRoleInfo, upload.array('attachments', 5), async (req, res) => {
  try {
    const {
      recipient_id,
      recipient_type,
      subject,
      message,
      communication_type,
      priority,
      related_request_id,
      related_report_id
    } = req.body;

    if (!recipient_id || !subject || !message) {
      return res.status(400).json({ error: 'Recipient, subject, and message are required' });
    }

    const senderId = req.user.id;
    const senderType = req.user.userType || 'branch';
    
    // Get sender info
    const senderName = await getUserName(senderId, senderType);
    const senderRole = await getUserRole(senderId, senderType);
    
    // Get recipient info
    const recipientName = await getUserName(parseInt(recipient_id), recipient_type || 'branch');
    const recipientRole = await getUserRole(parseInt(recipient_id), recipient_type || 'branch');
    
    // Handle attachments
    const attachments = req.files ? req.files.map(f => `/uploads/communications/${f.filename}`) : [];
    
    // Insert communication
    const result = await db.runAsync(
      `INSERT INTO communications (
        sender_id, sender_type, sender_name, sender_role,
        recipient_id, recipient_type, recipient_name, recipient_role,
        subject, message, communication_type, priority,
        related_request_id, related_report_id, attachments, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        senderId, senderType, senderName, senderRole,
        parseInt(recipient_id), recipient_type || 'branch', recipientName, recipientRole,
        subject, message, communication_type || 'general', priority || 'normal',
        related_request_id || null, related_report_id || null,
        JSON.stringify(attachments), 'sent'
      ]
    );

    // Create notification for recipient
    await createNotification(
      parseInt(recipient_id),
      recipient_type || 'branch',
      'communication',
      'New Communication',
      `You have received a new communication: "${subject}" from ${senderName}`,
      result.lastID,
      'communication'
    );

    console.log(`[Communication] Created communication ${result.lastID} from ${senderName} to ${recipientName}`);

    res.json({
      message: 'Communication sent successfully',
      communicationId: result.lastID
    });
  } catch (error) {
    console.error('Create communication error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get received communications (inbox)
router.get('/inbox', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    const communications = await db.allAsync(
      `SELECT c.*, 
       COUNT(cr.id) as reply_count
       FROM communications c
       LEFT JOIN communication_replies cr ON c.id = cr.communication_id
       WHERE c.recipient_id = ? AND c.recipient_type = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [userId, userType]
    );

    // Get replies for each communication
    const communicationsWithReplies = await Promise.all(
      communications.map(async (comm) => {
        const replies = await db.allAsync(
          `SELECT * FROM communication_replies 
           WHERE communication_id = ? 
           ORDER BY created_at ASC`,
          [comm.id]
        );
        return { ...comm, replies };
      })
    );

    res.json(communicationsWithReplies);
  } catch (error) {
    console.error('Get inbox error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get sent communications
router.get('/sent', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    const communications = await db.allAsync(
      `SELECT c.*, 
       COUNT(cr.id) as reply_count
       FROM communications c
       LEFT JOIN communication_replies cr ON c.id = cr.communication_id
       WHERE c.sender_id = ? AND c.sender_type = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [userId, userType]
    );

    // Get replies for each communication
    const communicationsWithReplies = await Promise.all(
      communications.map(async (comm) => {
        const replies = await db.allAsync(
          `SELECT * FROM communication_replies 
           WHERE communication_id = ? 
           ORDER BY created_at ASC`,
          [comm.id]
        );
        return { ...comm, replies };
      })
    );

    res.json(communicationsWithReplies);
  } catch (error) {
    console.error('Get sent communications error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get communication history between two users
router.get('/history/:otherUserId', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    const otherUserId = parseInt(req.params.otherUserId);
    
    const communications = await db.allAsync(
      `SELECT c.*, 
       COUNT(cr.id) as reply_count
       FROM communications c
       LEFT JOIN communication_replies cr ON c.id = cr.communication_id
       WHERE (
         (c.sender_id = ? AND c.sender_type = ? AND c.recipient_id = ?) OR
         (c.sender_id = ? AND c.recipient_id = ? AND c.recipient_type = ?)
       )
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
      [userId, userType, otherUserId, otherUserId, userId, userType]
    );

    // Get replies for each communication
    const communicationsWithReplies = await Promise.all(
      communications.map(async (comm) => {
        const replies = await db.allAsync(
          `SELECT * FROM communication_replies 
           WHERE communication_id = ? 
           ORDER BY created_at ASC`,
          [comm.id]
        );
        return { ...comm, replies };
      })
    );

    res.json(communicationsWithReplies);
  } catch (error) {
    console.error('Get communication history error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get single communication with full details
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const communicationId = req.params.id;
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    const communication = await db.getAsync(
      `SELECT * FROM communications WHERE id = ?`,
      [communicationId]
    );

    if (!communication) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    // Check if user has access (sender or recipient)
    const hasAccess = 
      (communication.sender_id === userId && communication.sender_type === userType) ||
      (communication.recipient_id === userId && communication.recipient_type === userType);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get replies
    const replies = await db.allAsync(
      `SELECT * FROM communication_replies 
       WHERE communication_id = ? 
       ORDER BY created_at ASC`,
      [communicationId]
    );

    res.json({ ...communication, replies });
  } catch (error) {
    console.error('Get communication error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Mark communication as read
router.post('/:id/read', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const communicationId = req.params.id;
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    const communication = await db.getAsync(
      `SELECT * FROM communications WHERE id = ?`,
      [communicationId]
    );

    if (!communication) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    // Only recipient can mark as read
    if (communication.recipient_id !== userId || communication.recipient_type !== userType) {
      return res.status(403).json({ error: 'Only recipient can mark as read' });
    }

    await db.runAsync(
      `UPDATE communications 
       SET is_read = 1, read_at = CURRENT_TIMESTAMP, status = 'read', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [communicationId]
    );

    // Notify sender that message was read
    await createNotification(
      communication.sender_id,
      communication.sender_type,
      'communication',
      'Communication Read',
      `${communication.recipient_name} has read your communication: "${communication.subject}"`,
      communicationId,
      'communication'
    );

    res.json({ message: 'Communication marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Acknowledge communication
router.post('/:id/acknowledge', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const { acknowledgment_message } = req.body;
    const communicationId = req.params.id;
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    const communication = await db.getAsync(
      `SELECT * FROM communications WHERE id = ?`,
      [communicationId]
    );

    if (!communication) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    // Only recipient can acknowledge
    if (communication.recipient_id !== userId || communication.recipient_type !== userType) {
      return res.status(403).json({ error: 'Only recipient can acknowledge' });
    }

    await db.runAsync(
      `UPDATE communications 
       SET is_acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP, 
           acknowledgment_message = ?, status = 'acknowledged', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [acknowledgment_message || '', communicationId]
    );

    // Notify sender that message was acknowledged
    await createNotification(
      communication.sender_id,
      communication.sender_type,
      'communication',
      'Communication Acknowledged',
      `${communication.recipient_name} has acknowledged your communication: "${communication.subject}"`,
      communicationId,
      'communication'
    );

    res.json({ message: 'Communication acknowledged' });
  } catch (error) {
    console.error('Acknowledge communication error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Reply to communication
router.post('/:id/reply', authMiddleware, attachRoleInfo, upload.array('attachments', 5), async (req, res) => {
  try {
    const { message } = req.body;
    const communicationId = req.params.id;
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const communication = await db.getAsync(
      `SELECT * FROM communications WHERE id = ?`,
      [communicationId]
    );

    if (!communication) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    // Check if user is sender or recipient
    const isSender = communication.sender_id === userId && communication.sender_type === userType;
    const isRecipient = communication.recipient_id === userId && communication.recipient_type === userType;

    if (!isSender && !isRecipient) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const senderName = await getUserName(userId, userType);
    
    // Handle attachments
    const attachments = req.files ? req.files.map(f => `/uploads/communications/${f.filename}`) : [];
    
    // Insert reply
    const result = await db.runAsync(
      `INSERT INTO communication_replies (communication_id, sender_id, sender_type, sender_name, message, attachments) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [communicationId, userId, userType, senderName, message, JSON.stringify(attachments)]
    );

    // Update communication status
    const newStatus = isRecipient ? 'replied' : communication.status;
    await db.runAsync(
      `UPDATE communications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, communicationId]
    );

    // Notify the other party
    const notifyUserId = isRecipient ? communication.sender_id : communication.recipient_id;
    const notifyUserType = isRecipient ? communication.sender_type : communication.recipient_type;
    
    await createNotification(
      notifyUserId,
      notifyUserType,
      'communication',
      'New Reply',
      `${senderName} replied to: "${communication.subject}"`,
      communicationId,
      'communication'
    );

    res.json({ message: 'Reply sent successfully', replyId: result.lastID });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get unread count
router.get('/inbox/unread-count', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'branch';
    
    const result = await db.getAsync(
      `SELECT COUNT(*) as count FROM communications 
       WHERE recipient_id = ? AND recipient_type = ? AND is_read = 0`,
      [userId, userType]
    );

    res.json({ unreadCount: result.count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

