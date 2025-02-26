import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Define the database file path
const DB_PATH = path.join(process.cwd(), 'data', 'nanos-dashboard.db');

// Define user interface
interface User {
  id: number;
  username: string;
  created_at: string;
  updated_at: string;
}

// Define onboarding status interface
interface OnboardingStatus {
  onboarding_completed: number;
}

// Define server config interface
interface ServerConfig {
  discover: {
    name: string;
    description: string;
    ip: string;
    port: number;
    query_port: number;
    announce: boolean;
    dedicated_server: boolean;
  };
  general: {
    max_players: number;
    password: string;
    token: string;
    banned_ids: string[];
  };
  game: {
    map: string;
    game_mode: string;
    packages: string[];
    assets: string[];
    loading_screen: string;
  };
  custom_settings: Record<string, unknown>;
  debug: {
    log_level: number;
    async_log: boolean;
    profiling: boolean;
  };
  optimization: {
    tick_rate: number;
    compression: number;
  };
}

// Ensure the data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create and initialize the database
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize database schema
function initializeDatabase() {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create user_settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      onboarding_completed BOOLEAN DEFAULT 0,
      last_login TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create server_config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_config (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensures only one configuration
      config_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database initialized successfully');
}

// Initialize the database
initializeDatabase();

// User-related functions
export function getUser(username: string): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username) as User | undefined;
}

export function createUser(username: string): User | undefined {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (username) VALUES (?)');
  const result = stmt.run(username);
  
  if (result.changes > 0) {
    const user = getUser(username);
    // Initialize user settings
    if (user) {
      db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(user.id);
    }
    return user;
  }
  
  return getUser(username);
}

export function updateOnboardingStatus(username: string, completed: boolean): boolean {
  const user = getUser(username);
  if (!user) return false;
  
  const stmt = db.prepare(`
    UPDATE user_settings 
    SET onboarding_completed = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `);
  
  const result = stmt.run(completed ? 1 : 0, user.id);
  return result.changes > 0;
}

export function getOnboardingStatus(username: string): boolean {
  const stmt = db.prepare(`
    SELECT us.onboarding_completed 
    FROM user_settings us
    JOIN users u ON us.user_id = u.id
    WHERE u.username = ?
  `);
  
  const result = stmt.get(username) as OnboardingStatus | undefined;
  return result ? Boolean(result.onboarding_completed) : false;
}

export function updateLastLogin(username: string): boolean {
  const user = getUser(username);
  if (!user) return false;
  
  const stmt = db.prepare(`
    UPDATE user_settings 
    SET last_login = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `);
  
  const result = stmt.run(user.id);
  return result.changes > 0;
}

// Server config functions
export function getServerConfig(): ServerConfig | null {
  const stmt = db.prepare('SELECT config_json FROM server_config WHERE id = 1');
  const result = stmt.get();
  
  if (!result) {
    return null;
  }
  
  return JSON.parse(result.config_json) as ServerConfig;
}

export function saveServerConfig(config: ServerConfig): boolean {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO server_config (id, config_json, updated_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
  `);
  
  try {
    const result = stmt.run(JSON.stringify(config));
    return result.changes > 0;
  } catch (error) {
    console.error('Error saving server config:', error);
    return false;
  }
}

export function initializeDefaultConfig(): boolean {
  // Only initialize if no config exists
  if (getServerConfig()) {
    return false;
  }

  const defaultConfig: ServerConfig = {
    discover: {
      name: "a great server",
      description: "nanos made easy",
      ip: "0.0.0.0",
      port: 7777,
      query_port: 7778,
      announce: true,
      dedicated_server: true
    },
    general: {
      max_players: 64,
      password: "",
      token: "",
      banned_ids: []
    },
    game: {
      map: "default-blank-map",
      game_mode: "",
      packages: [],
      assets: [],
      loading_screen: ""
    },
    custom_settings: {},
    debug: {
      log_level: 1,
      async_log: true,
      profiling: false
    },
    optimization: {
      tick_rate: 33,
      compression: 0
    }
  };

  return saveServerConfig(defaultConfig);
}

// Export the database instance for advanced usage
export default db;
