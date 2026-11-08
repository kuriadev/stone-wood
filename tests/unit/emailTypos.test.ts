// "Did you mean …?" for a misspelt email provider.
import { suggestEmail } from "@/lib/emailTypos";

describe("suggestEmail", () => {
  it("catches the common provider slips", () => {
    expect(suggestEmail("juan@gmial.com")).toBe("juan@gmail.com");
    expect(suggestEmail("juan@gmail.con")).toBe("juan@gmail.com");
    expect(suggestEmail("juan@gmailcom")).toBe("juan@gmail.com");
    expect(suggestEmail("juan@gmai.com")).toBe("juan@gmail.com");
    expect(suggestEmail("Juan.Dela@Yaho.com")).toBe("Juan.Dela@yahoo.com");
    expect(suggestEmail("juan@hotmial.com")).toBe("juan@hotmail.com");
    expect(suggestEmail("juan@outlok.com")).toBe("juan@outlook.com");
    expect(suggestEmail("juan@icloud.co")).toBe("juan@icloud.com");
  });

  it("fixes .con on any domain", () => {
    expect(suggestEmail("sales@stonewoodresort.con")).toBe("sales@stonewoodresort.com");
  });

  it("leaves real addresses alone, including ones close to a big provider", () => {
    for (const ok of ["juan@gmail.com", "juan@yahoo.com.ph", "juan@mail.com", "juan@email.com", "juan@me.com", "juan@dlsu.edu.ph", "juan@company.co", "juan@up.edu.ph"]) {
      expect(suggestEmail(ok)).toBeNull();
    }
  });

  it("waits until there is a domain to judge", () => {
    expect(suggestEmail("juan")).toBeNull();
    expect(suggestEmail("juan@")).toBeNull();
    expect(suggestEmail("juan@gm")).toBeNull();
    expect(suggestEmail("")).toBeNull();
  });
});
