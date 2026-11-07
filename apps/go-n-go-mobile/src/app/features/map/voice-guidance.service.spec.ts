import { QueueStrategy } from "@capacitor-community/text-to-speech";
import type { TextToSpeechPlugin } from "@capacitor-community/text-to-speech";
import { VoiceGuidanceService } from "./voice-guidance.service";

describe("VoiceGuidanceService", () => {
  let service: VoiceGuidanceService;
  let textToSpeech: jasmine.SpyObj<TextToSpeechPlugin>;

  beforeEach(() => {
    textToSpeech = jasmine.createSpyObj<TextToSpeechPlugin>("TextToSpeech", [
      "isLanguageSupported",
      "getSupportedVoices",
      "speak",
      "stop",
    ]);
    textToSpeech.isLanguageSupported.and.resolveTo({
      supported: true,
    });
    textToSpeech.getSupportedVoices.and.resolveTo({
      voices: [
        {
          default: true,
          lang: "en-US",
          localService: true,
          name: "English",
          voiceURI: "local-en",
        },
        {
          default: false,
          lang: "ms-MY",
          localService: true,
          name: "Bahasa Malaysia",
          voiceURI: "local-ms",
        },
        {
          default: false,
          lang: "ta-IN",
          localService: true,
          name: "Tamil",
          voiceURI: "local-ta",
        },
      ],
    });
    textToSpeech.speak.and.resolveTo();
    textToSpeech.stop.and.resolveTo();
    service = new VoiceGuidanceService(textToSpeech);
  });

  it("uses the system voice for English, Bahasa Malaysia, and Tamil", async () => {
    await service.speak("Continue straight.", "en");
    await service.speak("Teruskan perjalanan.", "ms");
    await service.speak("நேராகத் தொடரவும்.", "ta");

    expect(textToSpeech.isLanguageSupported).toHaveBeenCalledWith({
      lang: "en-US",
    });
    expect(textToSpeech.isLanguageSupported).toHaveBeenCalledWith({
      lang: "ms-MY",
    });
    expect(textToSpeech.isLanguageSupported).toHaveBeenCalledWith({
      lang: "ta-IN",
    });
    expect(textToSpeech.speak).toHaveBeenCalledWith(
      jasmine.objectContaining({
        text: "நேராகத் தொடரவும்.",
        lang: "ta-IN",
        rate: 1,
        voice: 2,
        queueStrategy: QueueStrategy.Flush,
      }),
    );
  });

  it("surfaces a missing device voice instead of silently substituting a language", async () => {
    textToSpeech.isLanguageSupported.and.resolveTo({
      supported: false,
    });

    await expectAsync(service.speak("Turn left.", "ta")).toBeRejectedWithError(
      "The system does not provide a ta speech voice.",
    );
    expect(textToSpeech.speak).not.toHaveBeenCalled();
  });

  it("does not use a remote voice when the language is supported only remotely", async () => {
    textToSpeech.getSupportedVoices.and.resolveTo({
      voices: [
        {
          default: true,
          lang: "ta-IN",
          localService: false,
          name: "Remote Tamil",
          voiceURI: "remote-ta",
        },
      ],
    });

    await expectAsync(
      service.speak("வலப்புறம் திரும்பவும்.", "ta"),
    ).toBeRejectedWithError("The system does not provide a local ta voice.");
    expect(textToSpeech.speak).not.toHaveBeenCalled();
  });

  it("stops the current system speech", async () => {
    await service.stop();

    expect(textToSpeech.stop).toHaveBeenCalled();
  });
});
