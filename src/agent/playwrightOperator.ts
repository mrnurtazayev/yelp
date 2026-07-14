import type { Page } from 'playwright';
import {
  Operator,
  parseBoxToScreenCoords,
  StatusEnum,
  type ExecuteParams,
  type ExecuteOutput,
  type ScreenshotOutput,
} from '@ui-tars/sdk/core';
import { createLogger } from '../logger.js';
import { sleep, randInt, typingDelays } from '../humanize.js';

const log = createLogger('ui-tars-operator');

/**
 * Оператор UI-TARS поверх страницы Playwright: модель "видит" скриншот
 * и выдает действия (click / type / scroll / hotkey / finished ...),
 * оператор исполняет их в том же браузере, где живет сессия Yelp.
 */
export class PlaywrightOperator extends Operator {
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,
      `left_double(start_box='[x1, y1, x2, y2]')`,
      `right_single(start_box='[x1, y1, x2, y2]')`,
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,
      `hotkey(key='ctrl a')`,
      `type(content='xxx') # Use escape characters \\', \\", and \\n in content part to ensure we can parse the content in normal python string format. If you want to submit your input, use \\n at the end of content.`,
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,
      `wait() # Sleep for 5s and take a screenshot to check for any changes.`,
      `finished(content='xxx') # Use escape characters \\', \\", and \\n in content part.`,
      `call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.`,
    ],
  };

  constructor(
    private page: Page,
    private msPerChar = 55,
  ) {
    super();
  }

  async screenshot(): Promise<ScreenshotOutput> {
    const buf = await this.page.screenshot({ type: 'png' });
    return { base64: buf.toString('base64'), scaleFactor: 1 };
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { parsedPrediction, screenWidth, screenHeight, factors } = params;
    const { action_type: action, action_inputs: inputs } = parsedPrediction;

    const coords = (box?: string) =>
      parseBoxToScreenCoords({ boxStr: box ?? '', screenWidth, screenHeight, factors });

    log.info(`action=${action}`, inputs);

    switch (action) {
      case 'click':
      case 'left_click':
      case 'left_single': {
        const { x, y } = coords(inputs.start_box);
        if (x != null && y != null) {
          await this.page.mouse.move(x + randInt(-2, 2), y + randInt(-2, 2), { steps: randInt(8, 20) });
          await sleep(randInt(60, 240));
          await this.page.mouse.click(x, y);
        }
        break;
      }
      case 'left_double':
      case 'double_click': {
        const { x, y } = coords(inputs.start_box);
        if (x != null && y != null) await this.page.mouse.dblclick(x, y);
        break;
      }
      case 'right_single':
      case 'right_click': {
        const { x, y } = coords(inputs.start_box);
        if (x != null && y != null) await this.page.mouse.click(x, y, { button: 'right' });
        break;
      }
      case 'drag': {
        const from = coords(inputs.start_box);
        const to = coords(inputs.end_box);
        if (from.x != null && from.y != null && to.x != null && to.y != null) {
          await this.page.mouse.move(from.x, from.y);
          await this.page.mouse.down();
          await this.page.mouse.move(to.x, to.y, { steps: randInt(15, 30) });
          await this.page.mouse.up();
        }
        break;
      }
      case 'type': {
        const content = (inputs.content ?? '').replace(/\\n$/, '\n');
        for (const ch of content) {
          if (ch === '\n') {
            await this.page.keyboard.press('Enter');
          } else {
            await this.page.keyboard.type(ch);
          }
          const d = [...typingDelays(ch, this.msPerChar)][0] ?? this.msPerChar;
          await sleep(d);
        }
        break;
      }
      case 'hotkey': {
        const key = (inputs.key ?? inputs.hotkey ?? '')
          .split(/\s+/)
          .map((k) => normalizeKey(k))
          .join('+');
        if (key) await this.page.keyboard.press(key);
        break;
      }
      case 'scroll': {
        const dir = (inputs.direction ?? 'down').toLowerCase();
        const amount = 400;
        const dx = dir === 'left' ? -amount : dir === 'right' ? amount : 0;
        const dy = dir === 'up' ? -amount : dir === 'down' ? amount : 0;
        await this.page.mouse.wheel(dx, dy);
        break;
      }
      case 'wait':
        await sleep(5000);
        break;
      case 'finished':
        return { status: StatusEnum.END };
      case 'call_user':
        return { status: StatusEnum.CALL_USER };
      default:
        log.warn(`Неизвестное действие: ${action}`);
    }

    await sleep(randInt(300, 900));
    return { status: StatusEnum.RUNNING };
  }
}

function normalizeKey(k: string): string {
  const map: Record<string, string> = {
    ctrl: 'Control',
    cmd: 'Meta',
    command: 'Meta',
    alt: 'Alt',
    shift: 'Shift',
    enter: 'Enter',
    return: 'Enter',
    esc: 'Escape',
    space: 'Space',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Delete',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    pageup: 'PageUp',
    pagedown: 'PageDown',
  };
  const low = k.toLowerCase();
  return map[low] ?? (k.length === 1 ? k : k[0].toUpperCase() + k.slice(1));
}
