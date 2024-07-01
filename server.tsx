import express, { Express, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import produitRoutes from './src/routes/ProductsRoutes';
import { rabbitMQClient } from './rabbitmq';
import dotenv from 'dotenv';
import { setupProductService } from "./src/services/productService";
import winston from 'winston';

dotenv.config();

const app: Express = express();

// Configuration de Winston pour le logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

// Middlewares de sécurité
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes avec versioning
app.use('/api/v1/products', produitRoutes);

// Gestion des erreurs améliorée
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error(`${err.name}: ${err.message}\n${err.stack}`);
    res.status(500).json({
        message: 'Une erreur est survenue',
        error: process.env.NODE_ENV === 'production' ? {} : err.message
    });
});

//Connection mongo
const connectToMongoDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/products');
        logger.info('Connecté à MongoDB');
    } catch (error) {
        logger.error('Erreur de connexion à MongoDB:', error);
        throw error;
    }
};
//Connection mongo
const setupRabbitMQ = async () => {
    try {
        await rabbitMQClient.connect();
        await rabbitMQClient.setup();
        logger.info('Connecté à RabbitMQ');
    } catch (error) {
        logger.error('Erreur de connexion à RabbitMQ:', error);
        throw error;
    }
};

const startServer = async (port: number) => {
    try {
        await connectToMongoDB();
        await setupRabbitMQ();
        await setupProductService();

        app.listen(port, () => {
            logger.info(`Serveur démarré sur le port ${port}`);
        }).on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`Le port ${port} est déjà utilisé.`);
                process.exit(1);
            } else {
                logger.error('Erreur lors du démarrage du serveur:', err);
                process.exit(1);
            }
        });
    } catch (error) {
        logger.error('Erreur lors du démarrage du serveur:', error);
        process.exit(1);
    }
};

const PORT = parseInt(process.env.PORT || '17301');

startServer(PORT);

// Gestion de l'arrêt propre du serveur
process.on('SIGINT', async () => {
    logger.info('Arrêt du serveur...');
    await mongoose.disconnect();
    await rabbitMQClient.closeConnection();
    process.exit(0);
});

export { app };