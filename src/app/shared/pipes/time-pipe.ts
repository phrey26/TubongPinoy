import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'time',
})
export class TimePipe implements PipeTransform {

  transform(value: Date | null | undefined, format: string = 'hh:mm:ss a'): string {
    if (!value) return '';

    const hours = value.getHours();
    const minutes = value.getMinutes();
    const seconds = value.getSeconds();

    const pad = (n: number) => n < 10 ? '0' + n : n;

    // 24-hour format
    if (format === 'HH:mm:ss') {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    // Default: 12-hour format
    const h = hours % 12 || 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';

    return `${pad(h)}:${pad(minutes)}:${pad(seconds)} ${ampm}`;
  }
}
