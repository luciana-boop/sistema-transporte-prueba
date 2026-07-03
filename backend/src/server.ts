// FILE: src/server.ts

import app from './app';
import prisma from './prisma/client';
import { guiasService } from './modules/guias/guias.service';

const PORT = parseInt(process.env.PORT || '3000', 10);

// GRE es asíncrono: el envío inicial solo devuelve un ticket; este intervalo
// define cada cuánto se consulta a SUNAT el estado de los tickets pendientes.
const SUNAT_TICKET_POLL_INTERVAL_MS = parseInt(process.env.SUNAT_TICKET_POLL_INTERVAL_MS || '120000', 10);

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

  // GRE es asíncrono: el envío inicial solo devuelve un ticket. Este job
  // recorre periódicamente las guías con ticket pendiente y consulta su
  // estado final en SUNAT hasta que "procesado: true".
  const pollTickets = () => {
    guiasService._procesarTicketsPendientes().catch((err) => {
      console.error('[SUNAT] Error en el job de polling de tickets de guías:', err);
    });
  };
  const ticketPollTimer = setInterval(pollTickets, SUNAT_TICKET_POLL_INTERVAL_MS);
  console.log(`🛰️  Polling de tickets SUNAT (guías) cada ${SUNAT_TICKET_POLL_INTERVAL_MS / 1000}s`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} recibido. Cerrando servidor...`);
    clearInterval(ticketPollTimer);
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
