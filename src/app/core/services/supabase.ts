import { Injectable, signal } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private clientRequest?: Promise<SupabaseClient>;
  private readonly connection = signal<'idle' | 'checking' | 'connected' | 'error'>('idle');
  readonly connectionStatus = this.connection.asReadonly();

  getClient(): Promise<SupabaseClient> {
    this.clientRequest ??= import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(environment.supabaseUrl, environment.supabaseKey))
      .catch(error => {
        this.clientRequest = undefined;
        throw error;
      });
    return this.clientRequest;
  }

  /** Read the public test message without changing any account or game data. */
  async checkConnection(): Promise<string> {
    this.connection.set('checking');
    try {
      const client = await this.getClient();
      const { data, error } = await client
        .from('connection_check')
        .select('message')
        .eq('id', 1)
        .abortSignal(AbortSignal.timeout(8000))
        .single<{ message: string }>();
      if (error) throw error;
      this.connection.set('connected');
      return data.message;
    } catch (error) {
      this.connection.set('error');
      throw error;
    }
  }
}
