import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import EventEmitter from 'events';
import dotenv from 'dotenv';
import { insert } from '../db/crudHelper';
import { KafkaEventPayload } from '../types/index';
import { initNotificationSubscribers } from './subscribers/notificationSubscriber';
import { KAFKA_TOPICS } from './topics';

process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafkaClientId = process.env.KAFKA_CLIENT_ID || 'dlm-logistics-service';

const kafka = new Kafka({
  clientId: kafkaClientId,
  brokers: kafkaBrokers,
  retry: {
    retries: 1,
    initialRetryTime: 100,
  },
  connectionTimeout: 1000,
});

let producer: Producer | null = null;
let isKafkaConnected = false;

const localBus = new EventEmitter();

/**
 * Ensure all defined Kafka topics exist on the cluster using Kafka Admin API
 */
export async function createKafkaTopics() {
  const admin: Admin = kafka.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    const requiredTopics = Object.values(KAFKA_TOPICS);
    const topicsToCreate = requiredTopics
      .filter((topic) => !existingTopics.includes(topic))
      .map((topic) => ({
        topic,
        numPartitions: 3,
        replicationFactor: 1,
      }));

    if (topicsToCreate.length > 0) {
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });
      console.log(`✅ Kafka Admin: Initialized ${topicsToCreate.length} missing topics on broker.`);
    } else {
      console.log('✅ Kafka Admin: All required topics already exist on broker.');
    }
  } catch (err: any) {
    console.warn(`⚠️ Kafka Admin: Failed to initialize topics (${err.message})`);
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

export async function initEventBus() {
  if (process.env.NODE_ENV === 'development') {
    isKafkaConnected = false;
    initNotificationSubscribers();
    return;
  }

  try {
    producer = kafka.producer();
    await producer.connect();
    isKafkaConnected = true;
    console.log('✅ Kafka Producer connected to brokers:', kafkaBrokers);

    // Auto-create required Kafka topics via Kafka Admin API
    await createKafkaTopics();
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
  }).catch((err) => { console.log(`Failed to Audit this Log - EventID: ${payload.eventId} -> ${err.message}`); });

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
      producer.disconnect().catch(() => { });
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
export async function subscribeEvent(topic: string, handler: (payload: KafkaEventPayload) => void) {
  // Always register on local event bus for in-memory / fallback execution
  localBus.on(topic, handler);

  // In development mode, stick to local event bus and do not attempt Kafka connections
  if (process.env.NODE_ENV === "development") {
    return;
  }

  let consumer: Consumer | null = null;

  try {
    consumer = kafka.consumer({ groupId: `dlm-event-sub-${topic}` });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic: msgTopic, partition, message }) => {
        if (message.value) {
          try {
            const payload: KafkaEventPayload = JSON.parse(message.value.toString());
            handler(payload);
          } catch (parseErr) {
            console.error(`[Kafka Consumer Parse Error] Topic: ${msgTopic}`, parseErr);
          }
        }
      },
    });

    console.log(`✅ Kafka Consumer subscribed to topic: ${topic}`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to Subscribe to Kafka Event Topic: ${topic} (${err.message}). Operating on local EventBus pipeline fallback.`);
  }
}
