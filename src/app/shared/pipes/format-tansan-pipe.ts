import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatTansan',
})
export class FormatTansanPipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): unknown {
    return null;
  }
}
