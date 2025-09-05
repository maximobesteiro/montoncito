import { Injectable } from '@nestjs/common';
import { hello } from '@mont/core-game';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World! ' + hello();
  }
}
