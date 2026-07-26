ALTER TABLE client_tokens ADD COLUMN raw_token TEXT;

CREATE UNIQUE INDEX client_tokens_raw_token_idx
  ON client_tokens(raw_token)
  WHERE raw_token IS NOT NULL;
