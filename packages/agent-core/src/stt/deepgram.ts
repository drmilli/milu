import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'eventemitter3';

interface DeepgramSTTEvents {
  transcript: (text: string, isFinal: boolean) => void;
  error: (err: Error) => void;
  close: () => void;
}

export class DeepgramSTT extends EventEmitter<DeepgramSTTEvents> {
  private connection: ReturnType<ReturnType<typeof createClient>['listen']['live']> | null = null;
  private client: ReturnType<typeof createClient>;

  constructor(apiKey: string) {
    super();
    this.client = createClient(apiKey);
  }

  connect() {
    this.connection = this.client.listen.live({
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      interim_results: true,
      endpointing: 300,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      this.connection!.on(LiveTranscriptionEvents.Transcript, (data) => {
        const text = data.channel.alternatives[0]?.transcript ?? '';
        const isFinal = data.is_final ?? false;
        if (text) this.emit('transcript', text, isFinal);
      });

      this.connection!.on(LiveTranscriptionEvents.Error, (err) => {
        this.emit('error', new Error(String(err)));
      });

      this.connection!.on(LiveTranscriptionEvents.Close, () => {
        this.emit('close');
      });
    });
  }

  send(audio: Buffer) {
    this.connection?.send(audio);
  }

  close() {
    this.connection?.finish();
    this.connection = null;
  }
}
