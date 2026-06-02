// FILE: src/server.ts

import app from './app';
import prisma from './prisma/client';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Verificar conexión a la base de datos
  try {
    await prisma.$connect();
    console.log('✅ Conexión a PostgreSQL establecida');
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📋 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('Endpoints disponibles:');
    console.log(`  POST   /api/auth/login`);
    console.log(`  GET    /api/auth/perfil`);
    console.log(`  GET    /api/clientes`);
    console.log(`  GET    /api/pedidos`);
    console.log(`  GET    /api/facturacion`);
    console.log(`  GET    /api/cobranza`);
    console.log(`  GET    /api/caja`);
    console.log(`  GET    /api/gastos`);
    console.log(`  GET    /api/reportes/dashboard`);
    console.log(`  GET    /api/usuarios  (solo ADMIN)`);
    console.log('══════════════════════════════════════════════');
    console.log('');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} recibido. Cerrando servidor...`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('✅ Servidor cerrado correctamente');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
