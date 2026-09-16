const express = require('express');
const router = express.Router();
const db = require('../database');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');

router.use(attachRoleInfo);

const CATEGORIES = [
  'vehicle',
  'musical',
  'computer',
  'furniture',
  'property',
  'sound',
  'generator',
  'office',
  'other'
];

const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'retired'];
const STATUSES = ['active', 'in_repair', 'disposed', 'lost', 'transferred'];

async function getAsset(id, churchId) {
  return db.getAsync(
    `SELECT a.*, b.branchname,
      m.firstname as custodian_member_firstname, m.lastname as custodian_member_lastname,
      s.firstname as custodian_staff_firstname, s.lastname as custodian_staff_lastname
     FROM assets a
     LEFT JOIN branches b ON b.id = a.branch_id
     LEFT JOIN members m ON m.id = a.custodian_member_id
     LEFT JOIN staff s ON s.id = a.custodian_staff_id
     WHERE a.id = ? AND a.church_id = ?`,
    [id, churchId]
  );
}

async function addHistory(churchId, assetId, event, createdBy, extra = {}) {
  await db.runAsync(
    `INSERT INTO asset_history (
      church_id, asset_id, event_type, summary, details,
      from_status, to_status, from_condition, to_condition,
      from_branch_id, to_branch_id, from_location, to_location,
      custodian_name, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      churchId,
      assetId,
      event.eventType,
      event.summary,
      event.details || null,
      extra.fromStatus || null,
      extra.toStatus || null,
      extra.fromCondition || null,
      extra.toCondition || null,
      extra.fromBranchId || null,
      extra.toBranchId || null,
      extra.fromLocation || null,
      extra.toLocation || null,
      extra.custodianName || null,
      createdBy
    ]
  );
}

async function nextAssetCode(churchId, category) {
  const prefix = String(category || 'AST').slice(0, 3).toUpperCase();
  const row = await db.getAsync(
    `SELECT COUNT(*) as c FROM assets WHERE church_id = ? AND category = ?`,
    [churchId, category]
  );
  const n = (row?.c || 0) + 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

router.get('/meta', requirePermission('assets.view', 'assets.manage'), (req, res) => {
  res.json({ categories: CATEGORIES, conditions: CONDITIONS, statuses: STATUSES });
});

router.get('/', requirePermission('assets.view', 'assets.manage'), async (req, res) => {
  try {
    let sql = `
      SELECT a.*, b.branchname,
        m.firstname as custodian_member_firstname, m.lastname as custodian_member_lastname
      FROM assets a
      LEFT JOIN branches b ON b.id = a.branch_id
      LEFT JOIN members m ON m.id = a.custodian_member_id
      WHERE a.church_id = ?`;
    const params = [req.churchId];

    if (!(req.user?.isadmin && req.query.allBranches === '1')) {
      if (req.query.branchId) {
        sql += ' AND a.branch_id = ?';
        params.push(req.query.branchId);
      } else if (req.query.allBranches !== '1') {
        sql += ' AND a.branch_id = ?';
        params.push(req.user.branchId);
      }
    }
    if (req.query.category) {
      sql += ' AND a.category = ?';
      params.push(req.query.category);
    }
    if (req.query.status) {
      sql += ' AND a.status = ?';
      params.push(req.query.status);
    } else if (req.query.includeDisposed !== '1') {
      sql += " AND a.status != 'disposed'";
    }
    if (req.query.q) {
      sql += ' AND (a.name LIKE ? OR a.asset_code LIKE ? OR a.description LIKE ? OR a.location LIKE ?)';
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like);
    }

    sql += ' ORDER BY a.category, a.asset_code';
    const assets = await db.allAsync(sql, params);

    const totals = await db.getAsync(
      `SELECT COUNT(*) as count, COALESCE(SUM(purchase_value), 0) as total_value
       FROM assets WHERE church_id = ? AND status = 'active'`,
      [req.churchId]
    );

    res.json({ assets, totals });
  } catch (error) {
    console.error('List assets:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requirePermission('assets.manage'), async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      purchaseValue,
      purchaseDate,
      location,
      custodianName,
      custodianMemberId,
      custodianStaffId,
      conditionStatus,
      status,
      serialNumber,
      documentId,
      notes,
      branchId,
      assetCode
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name required' });
    const cat = CATEGORIES.includes(category) ? category : 'other';
    const code = assetCode || (await nextAssetCode(req.churchId, cat));
    const bid = branchId || req.user.branchId;

    const branch = await db.getAsync(
      'SELECT id FROM branches WHERE id = ? AND church_id = ?',
      [bid, req.churchId]
    );
    if (!branch) return res.status(400).json({ error: 'Invalid branch' });

    const result = await db.runAsync(
      `INSERT INTO assets (
        church_id, branch_id, asset_code, category, name, description,
        purchase_value, purchase_date, location, custodian_name,
        custodian_member_id, custodian_staff_id, condition_status, status,
        serial_number, document_id, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        bid,
        code,
        cat,
        name,
        description || null,
        purchaseValue != null ? Number(purchaseValue) : null,
        purchaseDate || null,
        location || null,
        custodianName || null,
        custodianMemberId || null,
        custodianStaffId || null,
        CONDITIONS.includes(conditionStatus) ? conditionStatus : 'good',
        STATUSES.includes(status) ? status : 'active',
        serialNumber || null,
        documentId || null,
        notes || null,
        req.user.id
      ]
    );

    await addHistory(
      req.churchId,
      result.lastID,
      { eventType: 'created', summary: `Asset ${code} registered` },
      req.user.id,
      {
        toStatus: 'active',
        toCondition: conditionStatus || 'good',
        toBranchId: bid,
        toLocation: location || null,
        custodianName: custodianName || null
      }
    );

    res.status(201).json({
      message: 'Asset created',
      id: result.lastID,
      asset: await getAsset(result.lastID, req.churchId)
    });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Asset code already exists' });
    }
    console.error('Create asset:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requirePermission('assets.view', 'assets.manage'), async (req, res) => {
  try {
    const asset = await getAsset(req.params.id, req.churchId);
    if (!asset) return res.status(404).json({ error: 'Not found' });

    const history = await db.allAsync(
      `SELECT * FROM asset_history WHERE asset_id = ? AND church_id = ? ORDER BY created_at DESC, id DESC`,
      [asset.id, req.churchId]
    );
    const maintenance = await db.allAsync(
      `SELECT * FROM asset_maintenance WHERE asset_id = ? AND church_id = ? ORDER BY service_date DESC, id DESC`,
      [asset.id, req.churchId]
    );

    res.json({ asset, history, maintenance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('assets.manage'), async (req, res) => {
  try {
    const asset = await getAsset(req.params.id, req.churchId);
    if (!asset) return res.status(404).json({ error: 'Not found' });

    const fields = {
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      purchase_value: req.body.purchaseValue,
      purchase_date: req.body.purchaseDate,
      location: req.body.location,
      custodian_name: req.body.custodianName,
      custodian_member_id: req.body.custodianMemberId,
      custodian_staff_id: req.body.custodianStaffId,
      condition_status: req.body.conditionStatus,
      status: req.body.status,
      serial_number: req.body.serialNumber,
      document_id: req.body.documentId,
      notes: req.body.notes,
      branch_id: req.body.branchId
    };

    if (fields.category && !CATEGORIES.includes(fields.category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (fields.condition_status && !CONDITIONS.includes(fields.condition_status)) {
      return res.status(400).json({ error: 'Invalid condition' });
    }
    if (fields.status && !STATUSES.includes(fields.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (fields.branch_id) {
      const b = await db.getAsync(
        'SELECT id FROM branches WHERE id = ? AND church_id = ?',
        [fields.branch_id, req.churchId]
      );
      if (!b) return res.status(400).json({ error: 'Invalid branch' });
    }

    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(asset.id);
    await db.runAsync(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, values);

    const changed = [];
    if (req.body.status && req.body.status !== asset.status) changed.push(`status ${asset.status}→${req.body.status}`);
    if (req.body.conditionStatus && req.body.conditionStatus !== asset.condition_status) {
      changed.push(`condition ${asset.condition_status}→${req.body.conditionStatus}`);
    }
    if (req.body.location && req.body.location !== asset.location) changed.push('location');
    if (req.body.branchId && Number(req.body.branchId) !== Number(asset.branch_id)) changed.push('branch');
    if (req.body.custodianName && req.body.custodianName !== asset.custodian_name) changed.push('custodian');

    await addHistory(
      req.churchId,
      asset.id,
      {
        eventType: 'updated',
        summary: changed.length ? `Updated: ${changed.join(', ')}` : 'Asset updated',
        details: req.body.notes || null
      },
      req.user.id,
      {
        fromStatus: asset.status,
        toStatus: req.body.status || asset.status,
        fromCondition: asset.condition_status,
        toCondition: req.body.conditionStatus || asset.condition_status,
        fromBranchId: asset.branch_id,
        toBranchId: req.body.branchId || asset.branch_id,
        fromLocation: asset.location,
        toLocation: req.body.location || asset.location,
        custodianName: req.body.custodianName || asset.custodian_name
      }
    );

    res.json({ message: 'Updated', asset: await getAsset(asset.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/assign', requirePermission('assets.manage'), async (req, res) => {
  try {
    const asset = await getAsset(req.params.id, req.churchId);
    if (!asset) return res.status(404).json({ error: 'Not found' });

    const location = req.body.location !== undefined ? req.body.location : asset.location;
    const custodianName = req.body.custodianName !== undefined ? req.body.custodianName : asset.custodian_name;
    const branchId = req.body.branchId || asset.branch_id;

    await db.runAsync(
      `UPDATE assets SET location = ?, custodian_name = ?, custodian_member_id = ?, custodian_staff_id = ?,
       branch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        location,
        custodianName,
        req.body.custodianMemberId !== undefined ? req.body.custodianMemberId : asset.custodian_member_id,
        req.body.custodianStaffId !== undefined ? req.body.custodianStaffId : asset.custodian_staff_id,
        branchId,
        asset.id
      ]
    );

    await addHistory(
      req.churchId,
      asset.id,
      {
        eventType: 'assigned',
        summary: `Assigned to ${custodianName || 'custodian'} at ${location || 'location'}`
      },
      req.user.id,
      {
        fromBranchId: asset.branch_id,
        toBranchId: branchId,
        fromLocation: asset.location,
        toLocation: location,
        custodianName
      }
    );

    res.json({ message: 'Assigned', asset: await getAsset(asset.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/maintenance', requirePermission('assets.manage'), async (req, res) => {
  try {
    const asset = await getAsset(req.params.id, req.churchId);
    if (!asset) return res.status(404).json({ error: 'Not found' });
    if (!req.body.description) return res.status(400).json({ error: 'description required' });

    const serviceDate = req.body.serviceDate || new Date().toISOString().slice(0, 10);
    const result = await db.runAsync(
      `INSERT INTO asset_maintenance (
        church_id, asset_id, service_date, description, cost, vendor, next_service_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        asset.id,
        serviceDate,
        req.body.description,
        Number(req.body.cost || 0),
        req.body.vendor || null,
        req.body.nextServiceDate || null,
        req.user.id
      ]
    );

    if (req.body.markInRepair) {
      await db.runAsync(
        `UPDATE assets SET status = 'in_repair', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [asset.id]
      );
    }
    if (req.body.markActive) {
      await db.runAsync(
        `UPDATE assets SET status = 'active', condition_status = COALESCE(?, condition_status), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.body.conditionStatus || null, asset.id]
      );
    }

    await addHistory(
      req.churchId,
      asset.id,
      {
        eventType: 'maintenance',
        summary: `Maintenance: ${req.body.description}`,
        details: req.body.vendor ? `Vendor: ${req.body.vendor}` : null
      },
      req.user.id,
      { toStatus: req.body.markInRepair ? 'in_repair' : asset.status }
    );

    res.status(201).json({
      message: 'Maintenance recorded',
      maintenance: await db.getAsync('SELECT * FROM asset_maintenance WHERE id = ?', [result.lastID]),
      asset: await getAsset(asset.id, req.churchId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requirePermission('assets.manage'), async (req, res) => {
  try {
    const asset = await getAsset(req.params.id, req.churchId);
    if (!asset) return res.status(404).json({ error: 'Not found' });

    if (req.query.hard === '1') {
      await db.runAsync('DELETE FROM assets WHERE id = ?', [asset.id]);
      return res.json({ message: 'Deleted' });
    }

    await db.runAsync(
      `UPDATE assets SET status = 'disposed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [asset.id]
    );
    await addHistory(
      req.churchId,
      asset.id,
      { eventType: 'disposed', summary: 'Asset disposed' },
      req.user.id,
      { fromStatus: asset.status, toStatus: 'disposed' }
    );
    res.json({ message: 'Asset disposed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
