import { Inject, InjectionToken, Injectable } from "@angular/core";
import {
  TextToSpeech,
  QueueStrategy,
} from "@capacitor-community/text-to-speech";
import type { TextToSpeechPlugin } from "@capacitor-community/text-to-speech";
import type { AppLocale } from "../../core/i18n/translation.service";

export const TEXT_TO_SPEECH_PLUGIN = new InjectionToken<TextToSpeechPlugin>(
  "TEXT_TO_SPEECH_PLUGIN",
  { providedIn: "root", factory: () => TextToSpeech },
);

const languageTags: Record<AppLocale, string> = {
  en: "en-US",
  ms: "ms-MY",
  ta: "ta-IN",
};

@Injectable({ providedIn: "root" })
export class VoiceGuidanceService {
  constructor(
    @Inject(TEXT_TO_SPEECH_PLUGIN)
    private readonly textToSpeech: TextToSpeechPlugin,
  ) {}

  async speak(text: string, locale: AppLocale): Promise<void> {
    const lang = languageTags[locale];
    const { supported } = await this.textToSpeech.isLanguageSupported({ lang });
    if (!supported) {
      throw new Error(`The system does not provide a ${locale} speech voice.`);
    }
    const { voices } = await this.textToSpeech.getSupportedVoices();
    const voice = voices.findIndex(
      (candidate) =>
        candidate.localService &&
        candidate.lang.toLowerCase().startsWith(locale),
    );
    if (voice < 0) {
      throw new Error(`The system does not provide a local ${locale} voice.`);
    }

    await this.textToSpeech.speak({
      text,
      lang,
      rate: 1,
      voice,
      queueStrategy: QueueStrategy.Flush,
    });
  }

  stop(): Promise<void> {
    return this.textToSpeech.stop();
  }
}
