import { BadRequestException } from "@nestjs/common";

export type PaymentOrderStatus =
  | "CREATED"
  | "PENDING"
  | "PAYING"
  | "PROCESSING"
  | "PAID"
  | "FULFILLED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDING"
  | "REFUNDED";

const allowedTransitions: Record<PaymentOrderStatus, PaymentOrderStatus[]> = {
  CREATED: ["PENDING", "PAYING", "PROCESSING", "PAID", "FAILED", "CANCELLED"],
  PENDING: ["PAYING", "PROCESSING", "PAID", "FAILED", "CANCELLED"],
  PAYING: ["PROCESSING", "PAID", "FAILED", "CANCELLED"],
  PROCESSING: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["FULFILLED", "FAILED", "REFUNDING", "REFUNDED"],
  FULFILLED: ["REFUNDING", "REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDING: ["REFUNDED", "FAILED"],
  REFUNDED: []
};

export function isPaymentOrderStatus(value: string): value is PaymentOrderStatus {
  return Object.prototype.hasOwnProperty.call(allowedTransitions, value);
}

export function canTransitionPaymentStatus(from: string, to: string) {
  if (from === to) return true;
  if (!isPaymentOrderStatus(from) || !isPaymentOrderStatus(to)) return false;
  return allowedTransitions[from].includes(to);
}

export function assertPaymentStatusTransition(from: string, to: string) {
  if (!canTransitionPaymentStatus(from, to)) {
    throw new BadRequestException(`Payment order cannot transition from ${from} to ${to}`);
  }
}

export function terminalPaymentStatuses() {
  return ["FAILED", "CANCELLED", "REFUNDED"] satisfies PaymentOrderStatus[];
}
