import fs from 'node:fs';
import path from 'node:path';

export interface ActivityEvent {
  ts: string;
  type:
    | 'reply_sent'
    | 'reply_generated_dry_run'
    | 'handoff'
    | 'error'
    | 'poll'
    | 'info';
  conversationId?: string;
  customer?: string;
  text?: string;
}

export interface ConversationState {
  /** id последнего входящего сообщения, на которое уже ответили */
  lastRepliedMessageKey?: string;
  lastReplyAt?: string;
  needsHuman?: boolean;
  handoffReason?: string;
}

interface StateFile {
  conversations: Record<string, ConversationState>;
  repliesByDay: Record<string, number>;
  activity: ActivityEvent[];
  paused: boolean;
}

const EMPTY: StateFile = { conversations: {}, repliesByDay: {}, activity: [], paused: false };

export class Store {
  private file: string;
  private state: StateFile;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'state.json');
    this.state = this.load();
  }

  private load(): StateFile {
    try {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private save() {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  conversation(id: string): ConversationState {
    return this.state.conversations[id] ?? {};
  }

  setConversation(id: string, patch: Partial<ConversationState>) {
    this.state.conversations[id] = { ...this.conversation(id), ...patch };
    this.save();
  }

  repliesToday(): number {
    const day = new Date().toISOString().slice(0, 10);
    return this.state.repliesByDay[day] ?? 0;
  }

  bumpRepliesToday() {
    const day = new Date().toISOString().slice(0, 10);
    this.state.repliesByDay[day] = (this.state.repliesByDay[day] ?? 0) + 1;
    this.save();
  }

  logActivity(ev: Omit<ActivityEvent, 'ts'>) {
    this.state.activity.push({ ts: new Date().toISOString(), ...ev });
    if (this.state.activity.length > 300) {
      this.state.activity = this.state.activity.slice(-300);
    }
    this.save();
  }

  get activity(): ActivityEvent[] {
    return this.state.activity;
  }

  get paused(): boolean {
    return this.state.paused;
  }

  setPaused(v: boolean) {
    this.state.paused = v;
    this.save();
  }

  get needsHumanConversations(): Array<{ id: string; state: ConversationState }> {
    return Object.entries(this.state.conversations)
      .filter(([, s]) => s.needsHuman)
      .map(([id, state]) => ({ id, state }));
  }
}
