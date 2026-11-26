import { handleChatMessage } from '../../../src/modules/chat/chat-fsm';
import {
  createFakeProducts,
  type FakeProduct,
  type FakeProductsService,
  PRODUCT_A,
  PRODUCT_B,
  PRODUCT_D,
} from '../../helpers/chat-products';

// TK-05.2 · QA fase 2 · D-04: cuando el catálogo se vuelve a mostrar (entrada inválida, aviso de producto no disponible o agotado),
// esa lista pasa a ser "la última lista mostrada" y es contra la que se resuelven los números siguientes (spec 03 D-04, F-4).
// Observación de la implementación (backend): ante una entrada inválida en CATALOG se vuelve a llamar a listCatalog.
// Prueba nueva de fase 2; no modifica las de fase 1. Unidad, sin red ni base de datos.
// Matriz: docs/qa/TK-05.2-matrix.md

type Session = Parameters<typeof handleChatMessage>[0];
type Handle = (session: Session, text: string, deps: { products: FakeProductsService }) => Promise<string[]> | string[];
const handle = handleChatMessage as unknown as Handle;

const NEWCOMER: FakeProduct = { id: 130, name: 'Aposito estéril QA', price: '700.00', currentStock: 9, isActive: true };

function setup(products: FakeProduct[]) {
  const fake = createFakeProducts(products);
  const session = { state: 'MAIN_MENU', cart: [] } as unknown as Session;
  const say = async (text: string): Promise<string> => (await handle(session, text, { products: fake.service })).join('\n');
  return { fake, session, say };
}

const lines = (text: string): string[] => text.split('\n').map((l) => l.trim());
function numberOf(text: string, name: string): number {
  const line = lines(text).find((l) => l.includes(name) && /^\d+\)/.test(l));
  if (!line) throw new Error(`no hay una línea numerada para "${name}" en:\n${text}`);
  return Number(/^(\d+)\)/.exec(line)![1]);
}

describe('TK-05.2 · D-04 · volver a mostrar el catálogo renueva la lista contra la que se resuelven los números', () => {
  test('entrada inválida con un producto nuevo entre la primera lista y la entrada: la lista re-mostrada rige y `1` es el producto nuevo, no el A de la primera lista', async () => {
    const { fake, session, say } = setup([PRODUCT_A, PRODUCT_D]);
    const first = await say('1');
    expect(numberOf(first, PRODUCT_A.name)).toBe(1);

    fake.products.unshift({ ...NEWCOMER }); // el operador crea un producto que pasa a ser el nº 1
    const reshown = await say('xyz');
    expect(session.state).toBe('CATALOG');
    expect(numberOf(reshown, NEWCOMER.name)).toBe(1);
    expect(numberOf(reshown, PRODUCT_A.name)).toBe(2);

    const asked = await say('1');
    expect(session.state).toBe('ASK_QUANTITY');
    expect(asked).toContain(NEWCOMER.name);
    expect(asked).not.toContain(PRODUCT_A.name);
    expect(fake.calls.filter((c) => c.startsWith('getAvailability:')).at(-1)).toBe(`getAvailability:${NEWCOMER.id}`);
  });

  test('entrada inválida con un producto desactivado entre la primera lista y la entrada: el producto desaparece de la lista re-mostrada y `1` es el siguiente', async () => {
    const { fake, session, say } = setup([PRODUCT_A, PRODUCT_D]);
    await say('1');
    fake.find(PRODUCT_A.id).isActive = false;

    const reshown = await say('99');
    expect(reshown).not.toContain(PRODUCT_A.name);
    expect(numberOf(reshown, PRODUCT_D.name)).toBe(1);

    const asked = await say('1');
    expect(session.state).toBe('ASK_QUANTITY');
    expect(asked).toContain(PRODUCT_D.name);
  });

  test('aviso por un producto agotado o no disponible: la lista re-mostrada también rige los números siguientes', async () => {
    const { fake, session, say } = setup([PRODUCT_A, PRODUCT_B, PRODUCT_D]);
    const first = await say('1');
    fake.products.unshift({ ...NEWCOMER });
    const reshown = await say(String(numberOf(first, PRODUCT_B.name))); // B sigue "Sin stock": aviso y lista nueva
    expect(session.state).toBe('CATALOG');
    expect(numberOf(reshown, NEWCOMER.name)).toBe(1);

    const asked = await say('1');
    expect(session.state).toBe('ASK_QUANTITY');
    expect(asked).toContain(NEWCOMER.name);
  });
});
