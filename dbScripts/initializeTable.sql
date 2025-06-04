CREATE TABLE platforms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(512) NOT NULL,
  name VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  authentication_endpoint TEXT NOT NULL,
  accesstoken_endpoint TEXT NOT NULL,
  auth_method VARCHAR(50) NOT NULL,  -- e.g., "JWK_SET"
  auth_key TEXT NOT NULL,            -- e.g., jwks_uri
  kid VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_platform (url, client_id)
);

