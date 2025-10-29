import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import personsRouter from './routes/persons.js';
import accountsRouter from './routes/accounts.js';
import categoriesRouter from './routes/categories.js';
import rulesRouter from './routes/rules.js';
import transactionsRouter from './routes/transactions.js';
import provisionsRouter from './routes/provisions.js';
import projectsRouter from './routes/projects.js';
import budgetsRouter from './routes/budgets.js';
import importsRouter from './routes/imports.js';
import { HttpError } from './errors.js';
import healthRouter from './routes/health.js';

// ✅ Fonction principale de création de l’application
export function createApp() {
  const app = express();

  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json());
  app.use(morgan('dev'));

  // ✅ Route santé enrichie (avec variables d’environnement)
  app.use('/health', healthRouter);

  // ✅ Autres routes API
  app.use('/persons', personsRouter);
  app.use('/accounts', accountsRouter);
  app.use('/categories', categoriesRouter);
  app.use('/rules', rulesRouter);
  app.use('/transactions', transactionsRouter);
  app.use('/provisions', provisionsRouter);
  app.use('/projects', projectsRouter);
  app.use('/budgets', budgetsRouter);
  app.use('/imports', importsRouter);

  // ✅ Gestion 404
  app.use((req, res, next) => {
    next(new HttpError(404, 'Not found'));
  });

  // ✅ Gestion d’erreurs globales
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    const payload = {
      error: err.message || 'Internal server error',
    };

    if (err.details) {
      payload.details = err.details;
    }

    if (status >= 500) {
      console.error(err);
    }

    res.status(status).json(payload);
  });

  return app;
}
