const db = require('../database');
const bcrypt = require('bcryptjs');
const RoleManager = require('../utils/roles');

async function createAdmin() {
  try {
    // Check if admin already exists
    const existing = await db.getAsync('SELECT id FROM branches WHERE email = ?', ['admin@church.com']);
    
    if (existing) {
      console.log('Admin user already exists!');
      console.log('Email: admin@church.com');
      console.log('Password: (use the password you set)');
      return;
    }

    // Ensure default church exists
    let church = await db.getAsync(`SELECT id FROM churches WHERE slug = 'default'`);
    if (!church) {
      const cr = await db.runAsync(
        `INSERT INTO churches (name, short_name, slug, email, currency, status)
         VALUES ('Default Church', 'Default', 'default', 'admin@church.com', 'USD', 'active')`
      );
      church = { id: cr.lastID };
    }

    // Create admin branch
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const result = await db.runAsync(
      'INSERT INTO branches (branchname, branchcode, email, password, address, city, state, country, currency, isadmin, church_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['Admin Branch', 'ADMIN001', 'admin@church.com', hashedPassword, 'Headquarters', 'City', 'State', 'Liberia', 'USD', 1, church.id]
    );

    // Assign PRESIDENT role
    try {
      await RoleManager.assignRole(result.lastID, 'branch', 'PRESIDENT', null, null, null);
      console.log('✅ Admin user created successfully!');
    } catch (error) {
      console.log('Admin created but role assignment failed:', error.message);
      console.log('You can assign the role manually through the Role Management page');
    }

    console.log('\n========================================');
    console.log('ADMIN CREDENTIALS:');
    console.log('========================================');
    console.log('Email: admin@church.com');
    console.log('Password: admin123');
    console.log('========================================');
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');
    console.log('\nAccess the system at: http://localhost:3004');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();

