import { expect, test } from 'vitest';
import { mount } from '../src/index';
test('exports mount', () => { expect(typeof mount).toBe('function'); });
