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
  | "EXPIRED"
  | "REFUNDING"
  | "REFUNDED"
  | "PART_REFUNDED"
  | "REVERSED";

const allowedTransitions: Record<PaymentOrderStatus, PaymentOrderStatus[]> = {
  CREATED: ["PENDING", "PAYING", "PROCESSING", "PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PENDING: ["PAYING", "PROCESSING", "PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PAYING: ["PROCESSING", "PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PAID: ["FULFILLED", "FAILED", "REFUNDING", "REFUNDED"],
  FULFILLED: ["REFUNDING", "REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDING: ["REFUNDED", "PART_REFUNDED", "FAILED", "FULFILLED"],
  REFUNDED: [],
  PART_REFUNDED: ["REFUNDING", "REVERSED"],
  REVERSED: []
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
  return ["FAILED", "CANCELLED", "EXPIRED", "REFUNDED", "REVERSED"] satisfies PaymentOrderStatus[];
}
