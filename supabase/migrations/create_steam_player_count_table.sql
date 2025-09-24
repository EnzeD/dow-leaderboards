-- Create table for caching Steam player count
CREATE TABLE IF NOT EXISTS steam_player_count (
  id INTEGER PRIMARY KEY DEFAULT 1,
  app_id TEXT NOT NULL DEFAULT '3556750',
  player_count INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT false,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Enable RLS
ALTER TABLE steam_player_count ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON steam_player_count
  FOR SELECT
  USING (true);

-- Allow public write access (for upsert operations)
CREATE POLICY "Allow public write access" ON steam_player_count
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert initial row
INSERT INTO steam_player_count (id, app_id, player_count, success)
VALUES (1, '3556750', NULL, false)
ON CONFLICT (id) DO NOTHING;

-- Create index on updated_at for faster queries
CREATE INDEX idx_steam_player_count_updated_at ON steam_player_count(updated_at);