-- Migration: Add featured_image_url column to bulletins table
-- Run this once against your Supabase database (SQL editor or CLI)

ALTER TABLE public.bulletins
  ADD COLUMN IF NOT EXISTS featured_image_url text;
