-- Migration: add FACTURADO to EstadoPedido enum
-- Safe: ADD VALUE no requiere recrear el tipo en PostgreSQL 10+

ALTER TYPE "EstadoPedido" ADD VALUE IF NOT EXISTS 'FACTURADO';
