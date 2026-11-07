import { TestBed } from "@angular/core/testing";
import { TranslationService } from "./translation.service";

describe("TranslationService", () => {
  beforeEach(() => {
    localStorage.removeItem("gng-locale");
    TestBed.configureTestingModule({});
  });

  it("provides English by default and changes the translated text", () => {
    const service = TestBed.inject(TranslationService);

    expect(service.text("checkConnection")).toBe("Check connection");

    service.setLocale("ms");

    expect(service.locale()).toBe("ms");
    expect(service.text("checkConnection")).toBe("Periksa sambungan");
    expect(localStorage.getItem("gng-locale")).toBe("ms");
    expect(document.documentElement.lang).toBe("ms");
  });

  it("rejects unsupported locale values", () => {
    const service = TestBed.inject(TranslationService);

    expect(() => service.setLocale("fr")).toThrowError(
      "Unsupported locale: fr",
    );
    expect(service.locale()).toBe("en");
  });

  it("provides a report refresh label in every supported locale", () => {
    const service = TestBed.inject(TranslationService);

    expect(service.text("mapCommunityRefresh")).toBe("Refresh reports");
    service.setLocale("ms");
    expect(service.text("mapCommunityRefresh")).toBe("Muat semula laporan");
    service.setLocale("ta");
    expect(service.text("mapCommunityRefresh")).toBe("அறிக்கைகளைப் புதுப்பி");
  });
});
