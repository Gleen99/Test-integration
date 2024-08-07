import { Request, Response } from 'express';
import { rabbitMQClient } from "../../../rabbitmq";
import { isValidObjectId } from 'mongoose';
import { validateProduct } from "../../Helpers/ValidatorsProducts";
import Product, {MongooseValidationError} from "../../models/products/ProductsModels";

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
        res.status(400).json({ message: 'ID du produit invalide' });
        return;
    }

    // Validate input data
    const validationErrors = validateProduct(req.body);
    if (validationErrors.length > 0) {
        res.status(400).json({ message: 'Validation failed', errors: validationErrors });
        return;
    }

    try {
        const product = await Product.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

        if (!product) {
            res.status(404).json({ message: 'Produit non trouvé' });
            return;
        }

        // Publier un message dans RabbitMQ
        await rabbitMQClient.publishMessage('produit_mis_a_jour', JSON.stringify(product));

        res.status(200).json(product);
    } catch (err ) {
        if (err instanceof Error) {
            if (err.name === 'ValidationError' && 'errors' in err) {
                const validationError = err as MongooseValidationError;
                res.status(400).json({ message: 'Erreur de validation', errors: validationError.errors });
            } else {
                res.status(500).json({ message: 'Erreur serveur', error: err.message });
            }
        } else {
            res.status(500).json({ message: 'Erreur serveur inconnue' });
        }


    }
};
