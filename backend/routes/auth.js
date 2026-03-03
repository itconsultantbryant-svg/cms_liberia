const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const RoleManager = require('../utils/roles');

// Register branch
router.post('/register', async (req, res) => {
  try {
    const { branchname, branchcode, email, password, address, city, state, country, currency } = req.body;
    
    // Check if email exists
    const existingBranch = await db.getAsync('SELECT id FROM branches WHERE email = ?', [email]);
    if (existingBranch) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Check if this is the first branch (super-admin)
    const branchCount = await db.getAsync('SELECT COUNT(*) as count FROM branches');
    const isAdmin = branchCount.count === 0 ? 1 : 0;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create branch
    const result = await db.runAsync(
      'INSERT INTO branches (branchname, branchcode, email, password, address, city, state, country, currency, isadmin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [branchname, branchcode, email, hashedPassword, address, city, state, country, currency || 'USD', isAdmin]
    );
    
    // Create admin member for this branch
    const [firstname, ...lastnameParts] = branchname.split(' ');
    const lastname = lastnameParts.join(' ') || '';
    
    await db.runAsync(
      'INSERT INTO members (branch_id, firstname, lastname, email, password, isadmin, position, sex, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [result.lastID, firstname, lastname, email, hashedPassword, 1, 'senior pastor', 'male', 'Mr']
    );
    
    // Assign role - first branch becomes President
    const roleCode = isAdmin ? 'PRESIDENT' : 'RESIDENT_PASTOR';
    try {
      await RoleManager.assignRole(result.lastID, 'branch', roleCode, null, null, null);
    } catch (error) {
      console.error('Error assigning role:', error);
      // Continue even if role assignment fails (for backward compatibility)
    }
    
    res.json({ message: 'Branch registered successfully', branchId: result.lastID });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login (supports both branches and sub-users)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // First check if it's a sub-user
    const subUser = await db.getAsync('SELECT * FROM sub_users WHERE email = ? AND is_active = 1', [email]);
    
    if (subUser) {
      // Check password
      const isMatch = await bcrypt.compare(password, subUser.password);
      if (!isMatch) {
        console.log(`[Login] Invalid password for sub-user: ${email}`);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Get branch info
      const branch = await db.getAsync('SELECT * FROM branches WHERE id = ?', [subUser.branch_id]);
      if (!branch) {
        return res.status(400).json({ error: 'Branch not found' });
      }

      // Parse permissions
      const permissions = typeof subUser.permissions === 'string' 
        ? JSON.parse(subUser.permissions) 
        : subUser.permissions;

      // Generate token
      const token = jwt.sign(
        { 
          id: subUser.id, 
          email: subUser.email, 
          branchId: subUser.branch_id,
          userType: 'sub_user',
          permissions: permissions
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
      
      return res.json({
        token,
        user: {
          id: subUser.id,
          email: subUser.email,
          firstname: subUser.firstname,
          lastname: subUser.lastname,
          branchname: `${subUser.firstname} ${subUser.lastname}`,
          position: subUser.position,
          branchId: subUser.branch_id,
          userType: 'sub_user',
          permissions: permissions,
          currency: branch.currency || 'USD'
        }
      });
    }
    
    // Check branch (regular user)
    const branch = await db.getAsync('SELECT * FROM branches WHERE email = ?', [email]);
    if (!branch) {
      console.log(`[Login] Branch not found for email: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, branch.password);
    if (!isMatch) {
      console.log(`[Login] Invalid password for branch: ${email} (ID: ${branch.id})`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log(`[Login] Successful login for branch: ${email} (ID: ${branch.id})`);
    
    // Get user roles
    let roles = [];
    let primaryRole = null;
    try {
      roles = await RoleManager.getUserRoles(branch.id, 'branch');
      primaryRole = await RoleManager.getPrimaryRole(branch.id, 'branch');
      console.log(`[Login] Roles fetched: ${roles.length} roles, primary: ${primaryRole?.role_code || 'none'}`);
    } catch (error) {
      console.error('[Login] Error fetching roles:', error);
      console.error('[Login] Error stack:', error.stack);
      // Continue without roles if there's an error - don't fail login
      roles = [];
      primaryRole = null;
    }
    
    // Generate token
    const token = jwt.sign(
      { id: branch.id, email: branch.email, isadmin: branch.isadmin, branchId: branch.id, userType: 'branch' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    const branchPermissions = (branch.permissions && branch.permissions !== '[]')
      ? (typeof branch.permissions === 'string' ? JSON.parse(branch.permissions) : branch.permissions)
      : [];
    const userResponse = {
      token,
      user: {
        id: branch.id,
        email: branch.email,
        branchname: branch.branchname,
        isadmin: branch.isadmin,
        branchId: branch.id,
        currency: branch.currency || 'USD',
        permissions: Array.isArray(branchPermissions) ? branchPermissions : [],
        roles: roles || [],
        primaryRole: primaryRole,
        userType: 'branch'
      }
    };
    console.log(`[Login] Successfully logged in user: ${email}, returning user data`);
    res.json(userResponse);
  } catch (error) {
    console.error('[Login] ❌ Login error:', error);
    console.error('[Login] Error stack:', error.stack);
    console.error('[Login] Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ error: 'Server error during login: ' + error.message });
  }
});

// Get current user (supports both branches and sub-users)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    console.log('[Get /me] User ID:', req.user.id, 'User Type:', req.user.userType);
    
    // Check if it's a sub-user
    if (req.user.userType === 'sub_user') {
      const subUser = await db.getAsync(
        'SELECT * FROM sub_users WHERE id = ? AND is_active = 1',
        [req.user.id]
      );
      
      if (!subUser) {
        console.log('[Get /me] Sub-user not found:', req.user.id);
        return res.status(404).json({ error: 'User not found' });
      }

      const branch = await db.getAsync('SELECT currency FROM branches WHERE id = ?', [subUser.branch_id]);
      const permissions = typeof subUser.permissions === 'string' 
        ? JSON.parse(subUser.permissions) 
        : subUser.permissions;

      console.log('[Get /me] Returning sub-user data');
      return res.json({
        user: {
          id: subUser.id,
          email: subUser.email,
          firstname: subUser.firstname,
          lastname: subUser.lastname,
          branchname: `${subUser.firstname} ${subUser.lastname}`,
          position: subUser.position,
          branchId: subUser.branch_id,
          userType: 'sub_user',
          permissions: permissions,
          currency: branch?.currency || 'USD'
        }
      });
    }

    // Regular branch user
    const branch = await db.getAsync('SELECT id, branchname, email, isadmin, branchcode, address, city, state, country, currency, permissions FROM branches WHERE id = ?', [req.user.id]);
    if (!branch) {
      console.log('[Get /me] Branch not found:', req.user.id);
      return res.status(404).json({ error: 'User not found' });
    }
    const permissions = (branch.permissions && branch.permissions !== '[]')
      ? (typeof branch.permissions === 'string' ? JSON.parse(branch.permissions) : branch.permissions)
      : [];
    // Get user roles
    let roles = [];
    let primaryRole = null;
    try {
      roles = await RoleManager.getUserRoles(req.user.id, 'branch');
      primaryRole = await RoleManager.getPrimaryRole(req.user.id, 'branch');
      console.log('[Get /me] User roles fetched:', roles.length, 'roles, primary:', primaryRole?.role_code);
    } catch (error) {
      console.error('[Get /me] Error fetching roles:', error);
    }
    console.log('[Get /me] Returning branch user data');
    res.json({ 
      user: {
        ...branch,
        permissions: Array.isArray(permissions) ? permissions : [],
        roles: roles,
        primaryRole: primaryRole,
        userType: 'branch'
      }
    });
  } catch (error) {
    console.error('[Get /me] Error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

