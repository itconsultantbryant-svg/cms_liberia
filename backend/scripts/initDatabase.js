const db = require('../database');
const fs = require('fs');
const path = require('path');

async function initDatabase() {
  try {
    // Read and execute main schema
    const schema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.runAsync(statement);
        } catch (err) {
          // Ignore errors for existing tables/indexes
          if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
            console.warn('Warning:', err.message);
          }
        }
      }
    }
    
    // Initialize roles if schema_roles.sql exists
    const rolesSchemaPath = path.join(__dirname, '../schema_roles.sql');
    if (fs.existsSync(rolesSchemaPath)) {
      const rolesSchema = fs.readFileSync(rolesSchemaPath, 'utf8');
      const roleStatements = rolesSchema.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of roleStatements) {
        if (statement.trim()) {
          try {
            await db.runAsync(statement);
          } catch (err) {
            // Ignore errors for existing data
            if (!err.message.includes('already exists') && !err.message.includes('duplicate') && !err.message.includes('UNIQUE constraint')) {
              console.warn('Warning:', err.message);
            }
          }
        }
      }
    }
    
    // Initialize requests schema if schema_requests.sql exists
    const requestsSchemaPath = path.join(__dirname, '../schema_requests.sql');
    if (fs.existsSync(requestsSchemaPath)) {
      const requestsSchema = fs.readFileSync(requestsSchemaPath, 'utf8');
      const requestStatements = requestsSchema.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of requestStatements) {
        if (statement.trim()) {
          try {
            await db.runAsync(statement);
          } catch (err) {
            // Ignore errors for existing tables/indexes
            if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
              console.warn('Warning:', err.message);
            }
          }
        }
      }
    }
    
    // Initialize staff schema if schema_staff.sql exists
    const staffSchemaPath = path.join(__dirname, '../schema_staff.sql');
    if (fs.existsSync(staffSchemaPath)) {
      const staffSchema = fs.readFileSync(staffSchemaPath, 'utf8');
      const staffStatements = staffSchema.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of staffStatements) {
        if (statement.trim()) {
          try {
            await db.runAsync(statement);
          } catch (err) {
            // Ignore errors for existing tables/indexes
            if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
              console.warn('Warning:', err.message);
            }
          }
        }
      }
    }
    
    // Initialize notifications schema if schema_notifications.sql exists
    const notificationsSchemaPath = path.join(__dirname, '../schema_notifications.sql');
    if (fs.existsSync(notificationsSchemaPath)) {
      const notificationsSchema = fs.readFileSync(notificationsSchemaPath, 'utf8');
      const notificationsStatements = notificationsSchema.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of notificationsStatements) {
        if (statement.trim()) {
          try {
            await db.runAsync(statement);
          } catch (err) {
            // Ignore errors for existing tables/indexes
            if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
              console.warn('Warning:', err.message);
            }
          }
        }
      }
    }
    
    // Initialize communications schema if schema_communications.sql exists
    const communicationsSchemaPath = path.join(__dirname, '../schema_communications.sql');
    if (fs.existsSync(communicationsSchemaPath)) {
      const communicationsSchema = fs.readFileSync(communicationsSchemaPath, 'utf8');
      const communicationsStatements = communicationsSchema.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of communicationsStatements) {
        if (statement.trim()) {
          try {
            await db.runAsync(statement);
          } catch (err) {
            // Ignore errors for existing data
            if (!err.message.includes('already exists') && !err.message.includes('duplicate') && !err.message.includes('UNIQUE constraint')) {
              console.warn('Warning:', err.message);
            }
          }
        }
      }
    }
    
    console.log('Database initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initDatabase();

