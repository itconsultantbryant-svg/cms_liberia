const db = require('../database');

async function debugRequests() {
  try {
    console.log('=== Checking Requests ===');
    const requests = await db.allAsync('SELECT id, title, status, requested_by FROM requests ORDER BY id DESC LIMIT 20');
    console.log('\nAll Requests:');
    requests.forEach(req => {
      console.log(`ID: ${req.id}, Title: ${req.title}, Status: ${req.status}`);
    });

    console.log('\n=== Checking Finance Approvals ===');
    const financeApprovals = await db.allAsync(`
      SELECT ra.*, r.title, r.status 
      FROM request_approvals ra 
      JOIN requests r ON ra.request_id = r.id 
      WHERE ra.approval_level = 'finance_officer' 
      ORDER BY ra.created_at DESC
    `);
    console.log('\nFinance Officer Approvals:');
    financeApprovals.forEach(a => {
      console.log(`Request ID: ${a.request_id}, Title: ${a.title}, Request Status: ${a.status}, Approval Action: ${a.action}`);
    });

    console.log('\n=== Checking Status Mismatches ===');
    const mismatches = await db.allAsync(`
      SELECT r.id, r.title, r.status, ra.approval_level, ra.action
      FROM requests r
      JOIN request_approvals ra ON r.id = ra.request_id
      WHERE ra.approval_level = 'finance_officer' 
      AND ra.action = 'approve'
      AND r.status != 'approved_by_finance'
    `);
    
    if (mismatches.length > 0) {
      console.log('\n⚠️  Found status mismatches! Fixing...');
      for (const mismatch of mismatches) {
        console.log(`Fixing Request ID ${mismatch.id}: ${mismatch.title} (Status: ${mismatch.status} -> approved_by_finance)`);
        await db.runAsync(
          'UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['approved_by_finance', mismatch.id]
        );
      }
      console.log('✅ Fixed status mismatches!');
    } else {
      console.log('✅ No status mismatches found.');
    }

    console.log('\n=== Requests Ready for VP Approval ===');
    const vpRequests = await db.allAsync(`
      SELECT r.*, b.branchname as requested_by_name
      FROM requests r
      JOIN branches b ON r.requested_by = b.id
      WHERE r.status = 'approved_by_finance'
      ORDER BY r.created_at DESC
    `);
    console.log(`Found ${vpRequests.length} request(s) ready for VP approval:`);
    vpRequests.forEach(req => {
      console.log(`- ID: ${req.id}, Title: ${req.title}, From: ${req.requested_by_name}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugRequests();

