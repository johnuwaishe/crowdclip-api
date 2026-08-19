import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

describe('DemoController', () => {
  it('delegates the read-only demo response to the service', async () => {
    const response = { id: 'baby-keem-casino-live' };
    const service = { getDemo: jest.fn().mockResolvedValue(response) };
    const controller = new DemoController(service as unknown as DemoService);

    await expect(controller.getDemo()).resolves.toBe(response);
    expect(service.getDemo).toHaveBeenCalledTimes(1);
  });
});
