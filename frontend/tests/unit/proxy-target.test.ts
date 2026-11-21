import { DEFAULT_API_PROXY_TARGET, resolveApiProxyTarget } from '../../vite.config';

describe('QA-00.5-36 (D-7): destino del proxy de Vite', () => {
  it('sin la variable, el destino es http://localhost:3000', () => {
    expect(DEFAULT_API_PROXY_TARGET).toBe('http://localhost:3000');
    expect(resolveApiProxyTarget({})).toBe('http://localhost:3000');
  });

  it('con una variable vacía usa el valor por defecto', () => {
    expect(resolveApiProxyTarget({ MEDSUPPLY_API_PROXY_TARGET: '' })).toBe('http://localhost:3000');
  });

  it('con MEDSUPPLY_API_PROXY_TARGET definida usa su valor', () => {
    expect(resolveApiProxyTarget({ MEDSUPPLY_API_PROXY_TARGET: 'http://localhost:3100' })).toBe(
      'http://localhost:3100',
    );
  });
});
