/**
 * Production Service
 * Handles business logic for production execution and stock movements
 */

import { productionAPI, ProductionOrder, ProductionRecipe } from './api/productionAPI';
import { productAPI } from './api/products';
import { stockMovementAPI } from './stockMovementAPI';

export class ProductionService {
    /**
     * Complete a production order
     * 1. Deduct ingredients from stock (Sarf)
     * 2. Add finished product to stock (Üretimden Giriş)
     */
    static async completeOrder(orderId: string, producedQty: number): Promise<boolean> {
        try {
            const orders = await productionAPI.getOrders();
            const order = orders.find(o => o.id === orderId);
            if (!order) throw new Error('Order not found');

            const recipes = await productionAPI.getRecipes();
            const recipe = recipes.find(r => r.id === order.recipeId);
            if (!recipe) throw new Error('Recipe not found');

            // 1. Deduct Ingredients
            for (const ingredient of recipe.ingredients) {
                const totalNeeded = ingredient.quantity * producedQty;
                const product = await productAPI.getById(ingredient.materialId);
                if (product) {
                    // Update stock
                    await productAPI.updateStock(product.id, product.stock - totalNeeded);

                    // Add stock movement log (Sarf - TRCODE 1)
                    await stockMovementAPI.create(
                        {
                            trcode: 1, // Sarf
                            movement_type: 'out',
                            description: `${order.orderNo} nolu üretim emri sarfiyatı`,
                            document_no: order.orderNo
                        },
                        [{
                            product_id: product.id,
                            quantity: totalNeeded,
                            unit_price: ingredient.cost,
                            notes: `Reçete bileşeni`
                        }]
                    );
                }
            }

            // 2. Add Finished Product
            const finishedProduct = await productAPI.getById(order.productId);
            if (finishedProduct) {
                await productAPI.updateStock(finishedProduct.id, finishedProduct.stock + producedQty);

                // Add stock movement log (Üretimden Giriş - TRCODE 2)
                await stockMovementAPI.create(
                    {
                        trcode: 2, // Üretimden Giriş
                        movement_type: 'in',
                        description: `${order.orderNo} nolu üretim emri girişi`,
                        document_no: order.orderNo
                    },
                    [{
                        product_id: finishedProduct.id,
                        quantity: producedQty,
                        unit_price: recipe.totalCost
                    }]
                );
            }

            // 3. Update Order Status
            await productionAPI.saveOrder({
                id: orderId,
                status: 'completed',
                producedQty: producedQty
            });

            return true;
        } catch (error) {
            console.error('[ProductionService] completeOrder failed:', error);
            return false;
        }
    }
}
