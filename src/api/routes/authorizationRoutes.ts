import { Router } from 'express';
import { AuthorizationController } from '../controllers/AuthorizationController';

const router = Router();
const authController = new AuthorizationController();

/**
 * @swagger
 * /authorization/authorize:
 *   post:
 *     summary: Process a card authorization request
 *     description: Validate a card transaction and return an approve/decline decision
 *     tags: [Authorization]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthorizationRequest'
 *     responses:
 *       200:
 *         description: Authorization decision
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/AuthorizationResponse'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 responseTimeMs:
 *                   type: integer
 *                   description: Total response time in milliseconds
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/authorize', (req, res) => authController.authorize(req, res));

/**
 * @swagger
 * /authorization/transaction/{transactionId}:
 *   get:
 *     summary: Get transaction status
 *     description: Retrieve the status of a processed transaction
 *     tags: [Authorization]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, declined, failed]
 *                     processingTimeMs:
 *                       type: integer
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/transaction/:transactionId', (req, res) => authController.getTransactionStatus(req, res));

export default router; 