// db.ts
import mysql from "mysql2/promise";

let _connection: mysql.Connection | null = null;

export async function getConnection() {
  if (!_connection) {
    _connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "root",
      database: "lti",
    });
  }
  return _connection;
}
