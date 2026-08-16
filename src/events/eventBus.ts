import { Kafka, Producer } from 'kafkajs';
import EventEmitter from 'events';
import dotenv from 'dotenv';
import { insert } from '../db/crudHelper';
import { KafkaEventPayload } from '../types/index';
import { initNotificationSubscribers } from './subscribers/notificationSubscriber';

dotenv.config();

const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafkaClientId = process.env.KAFKA_CLIENT_ID || 'dlm-logistics-service';

const kafka = new Kafka({
  clientId: kafkaClientId,
  brokers: kafkaBrokers,
  retry: {
    retries: 2,
    initialRetryTime: 300,
  },
});

let producer: Producer | null = null;
let isKafkaConnected = false;

const localBus = new EventEmitter();

export async function initEventBus() {
  try {
    producer = kafka.producer();
    await producer.connect();
    isKafkaConnected = true;
    console.log('✅ Kafka Producer connected to brokers:', kafkaBrokers);
  } catch (error) {
    console.warn('⚠️ Apache Kafka broker not available. Using local EventBus pipeline fallback for events.');
    isKafkaConnected = false;
  }

  // Register Event-Driven Subscribers (Email, Push, Notifications)
  initNotificationSubscribers();
}

/**
 * Publish an event to Kafka Event Bus or local EventBus pipeline
 */
export async function publishEvent(topic: string, message: Record<string, any>): Promise<KafkaEventPayload> {
  const payload: KafkaEventPayload = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    topic,
    data: message,
  };

  // Log to audit table asynchronously
  insert('audit_logs', {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    actor_id: message.actorId || 'SYSTEM',
    action: topic,
    entity: message.entity || 'EVENT',
    entity_id: message.entityId || payload.eventId,
    details: payload,
  }).catch(() => {});

  if (isKafkaConnected && producer) {
    try {
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
      console.log(`[Kafka Event Published] -> Topic: ${topic}`);
      return payload;
    } catch (e: any) {
      console.warn(`⚠️ Kafka emission failed for topic ${topic} (${e.message}). Falling back to local EventBus.`);
      isKafkaConnected = false;
      producer.disconnect().catch(() => {});
    }
  }

  // Fallback local emission
  console.log(`📡 [EventBus Broadcast] -> Topic: ${topic}`, payload.eventId);
  localBus.emit(topic, payload);
  return payload;
}

/**
 * Subscribe to Event Bus topics
 */
export function subscribeEvent(topic: string, handler: (payload: KafkaEventPayload) => void) {
  localBus.on(topic, handler);
}
