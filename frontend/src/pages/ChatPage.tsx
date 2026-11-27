// Simulador de chat (TK-05.4; spec 05 §6.3 A, spec 03 §3 y §4.1). Solo muestra lo que devuelve la API:
// sin lógica de flujo. El sessionId vive solo en estado de React (D1) y el texto del bot se pinta como texto.
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { ApiError } from '../api/client';
import { sendChatMessage, startChatSession, type ChatReply } from '../api/chat';
import { validateChatPhone } from '../chat/phone';

interface Bubble {
  id: number;
  sender: 'bot' | 'customer';
  text: string;
}

// Texto del contrato para SESSION_INVALID (docs/openapi.yaml); se elige por `code`, no por `message`.
const SESSION_INVALID_TEXT = 'La conversación no es válida o expiró. Inicia una nueva conversación.';
const GENERIC_ERROR_TEXT = 'No se pudo completar la operación. Intenta de nuevo.';

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_INVALID') return SESSION_INVALID_TEXT;
  return GENERIC_ERROR_TEXT;
}

export default function ChatPage() {
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);
  const [digits, setDigits] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [bubbles]);

  const toBubbles = (reply: ChatReply): Bubble[] =>
    reply.messages.map((m) => ({ id: nextId.current++, sender: 'bot', text: m.text }));

  /** Inicia (o reinicia) la conversación con los nueve dígitos. */
  async function start(phone: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const reply = await startChatSession(phone);
      if (reply.sessionId === null) {
        // F-1 / CH-02: se muestra el mensaje de la API y no se abre la conversación.
        setSessionId(null);
        setBubbles([]);
        setNotice(reply.messages.map((m) => m.text).join('\n'));
        return;
      }
      setDigits(phone);
      setSessionId(reply.sessionId);
      setBubbles(toBubbles(reply));
      setDraft('');
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function handleStart(): void {
    const check = validateChatPhone(phoneInput);
    if (!check.ok) {
      setPhoneWarning(check.message);
      setNotice(null);
      return;
    }
    setPhoneWarning(null);
    void start(check.digits);
  }

  async function handleSend(): Promise<void> {
    const text = draft.trim();
    if (sessionId === null || text === '' || busy) return;
    setBubbles((prev) => [...prev, { id: nextId.current++, sender: 'customer', text }]);
    setDraft('');
    setBusy(true);
    setNotice(null);
    try {
      const reply = await sendChatMessage(sessionId, text);
      setBubbles((prev) => [...prev, ...toBubbles(reply)]);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  const inConversation = sessionId !== null;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#ece5dd' }}>
      <Card style={{ width: '100%', maxWidth: 560 }} styles={{ body: { padding: 0 } }}>
        <div style={{ background: '#075e54', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
            Simulador de chat
          </Typography.Title>
          {inConversation && digits !== null && (
            <Button icon={<ReloadOutlined />} disabled={busy} onClick={() => void start(digits)}>
              Reiniciar conversación
            </Button>
          )}
        </div>

        {!inConversation && (
          <Space direction="vertical" size="middle" style={{ width: '100%', padding: 16 }}>
            <Typography.Text type="secondary">Ingresa el teléfono del cliente para iniciar la conversación.</Typography.Text>
            <Space.Compact style={{ width: '100%' }}>
              <Space.Addon>+56</Space.Addon>
              <Input
                aria-label="Teléfono"
                inputMode="numeric"
                value={phoneInput}
                status={phoneWarning ? 'error' : undefined}
                onChange={(e) => setPhoneInput(e.target.value)}
                onPressEnter={handleStart}
              />
            </Space.Compact>
            {phoneWarning && <Typography.Text type="danger">{phoneWarning}</Typography.Text>}
            {notice && <Alert type="warning" showIcon message={notice} style={{ whiteSpace: 'pre-wrap' }} />}
            <Button type="primary" loading={busy} onClick={handleStart}>
              Iniciar conversación
            </Button>
          </Space>
        )}

        {inConversation && (
          <>
            <div
              role="log"
              aria-label="Conversación"
              style={{ height: 380, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#efeae2' }}
            >
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  data-sender={b.sender}
                  style={{
                    alignSelf: b.sender === 'customer' ? 'flex-end' : 'flex-start',
                    background: b.sender === 'customer' ? '#d9fdd3' : '#fff',
                    padding: '6px 10px',
                    borderRadius: 8,
                    maxWidth: '80%',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {b.text}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {notice && <Alert type="error" showIcon message={notice} banner />}
            <div style={{ display: 'flex', gap: 8, padding: 12 }}>
              <Input
                aria-label="Mensaje"
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                onPressEnter={() => void handleSend()}
              />
              <Button type="primary" disabled={busy} onClick={() => void handleSend()}>
                Enviar
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
