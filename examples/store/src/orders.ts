export type Order = { id: string; paid: boolean; status: 'draft' | 'submitted' | 'cancelled' };
export interface Payments { charge(orderId: string): Promise<'accepted' | 'refused'>; }
export async function submit(order: Order, payments: Payments): Promise<Order> {
  if (order.status !== 'draft') return order;
  const reply = await payments.charge(order.id);
  if (reply === 'refused') return order;
  return { ...order, status: 'submitted', paid: true };
}
export function cancel(order: Order): Order {
  if (order.status !== 'draft') throw new Error('Submitted orders cannot be cancelled here');
  return { ...order, status: 'cancelled' };
}
