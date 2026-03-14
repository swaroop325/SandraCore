-- Migration: add model_override to user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS model_override VARCHAR(100);
