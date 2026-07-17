/**
 * adminBus.js — Singleton event emitter for the super admin dashboard.
 *
 * Every scheduler job, API call, and agent action can call adminBus.emit()
 * and all connected SSE clients (admin dashboard tabs) receive the event
 * within milliseconds. No socket.io needed — pure HTTP SSE.
 *
 * Usage anywhere in the server:
 *   import { adminBus } from './adminBus.js';
 *   adminBus.emit('agent', { agent: 'webCrawler', status: 'running', detail: 'Fetching warfare topics...' });
 */

import { EventEmitter } from 'events';

class AdminBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // many SSE clients can listen simultaneously
    this._sseClients = new Set();
    this._recentEvents = []; // ring buffer — last 200 events for dashboard replay on reconnect
    this._agentState = {}; // live state per agent name
    this._featureFlags = this._defaultFlags();

    this.on('agent', (payload) => this._onAgentEvent(payload));
  }

  // ── SSE client management ──────────────────────────────────────────────────
  addClient(res) {
    this._sseClients.add(res);
    // Replay recent events so a freshly-opened tab catches up instantly
    for (const ev of this._recentEvents) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    // Send current agent state
    res.write(`data: ${JSON.stringify({ type: 'state_snapshot', agents: this._agentState, flags: this._featureFlags })}\n\n`);
  }

  removeClient(res) {
    this._sseClients.delete(res);
  }

  // ── Event broadcast ────────────────────────────────────────────────────────
  broadcast(payload) {
    const envelope = { ts: Date.now(), ...payload };
    this._recentEvents.push(envelope);
    if (this._recentEvents.length > 200) this._recentEvents.shift();

    const data = `data: ${JSON.stringify(envelope)}\n\n`;
    for (const client of this._sseClients) {
      try { client.write(data); } catch (_) { this._sseClients.delete(client); }
    }
  }

  // ── Agent event helpers ────────────────────────────────────────────────────
  agentStart(agent, detail = '') {
    this._agentState[agent] = { status: 'running', detail, startedAt: Date.now() };
    this.broadcast({ type: 'agent', agent, status: 'running', detail });
  }

  agentProgress(agent, detail) {
    if (this._agentState[agent]) this._agentState[agent].detail = detail;
    this.broadcast({ type: 'agent', agent, status: 'running', detail });
  }

  agentDone(agent, detail = '') {
    const start = this._agentState[agent]?.startedAt ?? Date.now();
    const duration = Math.round((Date.now() - start) / 1000);
    this._agentState[agent] = { status: 'idle', detail, lastRun: Date.now(), duration };
    this.broadcast({ type: 'agent', agent, status: 'done', detail, duration });
  }

  agentError(agent, error) {
    this._agentState[agent] = { status: 'error', detail: error, lastRun: Date.now() };
    this.broadcast({ type: 'agent', agent, status: 'error', detail: error });
  }

  agentLog(agent, detail) {
    this.broadcast({ type: 'log', agent, detail });
  }

  _onAgentEvent(payload) {
    // internal — already handled via agentStart/Done/Error helpers
  }

  // ── Feature flags ──────────────────────────────────────────────────────────
  _defaultFlags() {
    return {
      bible_reader:          { label: 'Bible Reader', enabled: true,  group: 'Core' },
      translation_switcher:  { label: 'Translation Switcher', enabled: true,  group: 'Core' },
      verse_explain:         { label: 'Verse Explain (AI)', enabled: true,  group: 'AI Features' },
      study_mode:            { label: 'Study Mode', enabled: true,  group: 'Core' },
      ai_prayer:             { label: 'AI Prayer Engine', enabled: true,  group: 'AI Features' },
      ai_devotion:           { label: 'AI Devotions', enabled: true,  group: 'AI Features' },
      rule_prayer:           { label: 'Rule-Based Prayer', enabled: true,  group: 'Self-Learning Engine' },
      rule_devotion:         { label: 'Rule-Based Devotions', enabled: true,  group: 'Self-Learning Engine' },
      sermon_transcription:  { label: 'Sermon Transcription', enabled: true,  group: 'AI Features' },
      push_notifications:    { label: 'Push Notifications', enabled: true,  group: 'Notifications' },
      prayer_reminders:      { label: 'Prayer Reminders', enabled: true,  group: 'Notifications' },
      devotion_reminders:    { label: 'Devotion Reminders', enabled: true,  group: 'Notifications' },
      web_crawler:           { label: 'Web Crawler', enabled: true,  group: 'Self-Learning Engine' },
      genetic_algorithm:     { label: 'Genetic Optimizer', enabled: true,  group: 'Self-Learning Engine' },
      auto_discovery:        { label: 'Auto-Discovery', enabled: true,  group: 'Self-Learning Engine' },
      quality_benchmark:     { label: 'Quality Benchmark', enabled: true,  group: 'Self-Learning Engine' },
      markov_model:          { label: 'Markov Language Model', enabled: true,  group: 'Self-Learning Engine' },
      bible_index:           { label: 'Full-Bible TF-IDF Index', enabled: true,  group: 'Self-Learning Engine' },
    };
  }

  getFlags() {
    return this._featureFlags;
  }

  setFlag(key, enabled) {
    if (!this._featureFlags[key]) return false;
    this._featureFlags[key].enabled = !!enabled;
    this.broadcast({ type: 'flag_update', key, enabled: !!enabled, label: this._featureFlags[key].label });
    return true;
  }

  isEnabled(key) {
    return this._featureFlags[key]?.enabled !== false; // default true for unknown flags
  }

  getAgentState() {
    return this._agentState;
  }
}

export const adminBus = new AdminBus();
