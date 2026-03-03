const db = require('../database');

async function fixFinanceApprovals() {
  try {
    console.log('=== Checking for Finance-Approved Requests ===\n');
    
    // Get all requests
    const allRequests = await db.allAsync('SELECT id, title, status FROM requests ORDER BY id DESC');
    console.log('All Requests:');
    allRequests.forEach(r => {
      console.log(`  ID: ${r.id}, Title: ${r.title}, Status: ${r.status}`);
    });
    
    console.log('\n=== Checking Approval Records ===');
    const allApprovals = await db.allAsync(`
      SELECT ra.*, r.title, r.status 
      FROM request_approvals ra 
      JOIN requests r ON ra.request_id = r.id 
      ORDER BY ra.created_at DESC
    `);
    
    if (allApprovals.length === 0) {
      console.log('⚠️  No approval records found in database!');
    } else {
      console.log('Approval Records:');
      allApprovals.forEach(a => {
        console.log(`  Request ID: ${a.request_id} (${a.title}), Level: ${a.approval_level}, Action: ${a.action}, Status: ${a.status}`);
      });
    }
    
    // Check for requests that should have approved_by_finance status
    console.log('\n=== Checking Status Mismatches ===');
    const financeApprovals = await db.allAsync(`
      SELECT ra.request_id, ra.approval_level, ra.action, r.status, r.title
      FROM request_approvals ra
      JOIN requests r ON ra.request_id = r.id
      WHERE ra.approval_level = 'finance_officer' AND ra.action = 'approve'
    `);
    
    if (financeApprovals.length > 0) {
      console.log(`Found ${financeApprovals.length} Finance Officer approval(s):`);
      for (const approval of financeApprovals) {
        console.log(`  Request ID: ${approval.request_id} (${approval.title}), Current Status: ${approval.status}`);
        if (approval.status !== 'approved_by_finance') {
          console.log(`  ⚠️  Status mismatch! Fixing...`);
          await db.runAsync(
            'UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['approved_by_finance', approval.request_id]
          );
          console.log(`  ✅ Fixed! Status updated to approved_by_finance`);
        }
      }
    } else {
      console.log('⚠️  No Finance Officer approvals found in request_approvals table.');
      console.log('   This means Finance Officer has not approved any requests yet,');
      console.log('   OR the approval records were not saved properly.');
    }
    
    // Final check
    console.log('\n=== Final Status Check ===');
    const finalRequests = await db.allAsync('SELECT id, title, status FROM requests WHERE status = "approved_by_finance"');
    console.log(`Requests with 'approved_by_finance' status: ${finalRequests.length}`);
    finalRequests.forEach(r => {
      console.log(`  ✅ ID: ${r.id}, Title: ${r.title}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixFinanceApprovals();

