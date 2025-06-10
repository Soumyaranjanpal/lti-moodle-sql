CREATE TABLE platforms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(512) NOT NULL,
  name VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  authentication_endpoint TEXT NOT NULL,
  accesstoken_endpoint TEXT NOT NULL,
  auth_method VARCHAR(50) NOT NULL,
  auth_key TEXT NOT NULL,
  kid VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_platform (url, client_id)
);

CREATE TABLE id_tokens (
  issuer VARCHAR(255) NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  deployment_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (issuer, client_id, deployment_id, user_id)
);


