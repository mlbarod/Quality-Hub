// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  formatCategoryFileSize,
  parseChangeCategoryClipboard,
  renderChangeCategorySheet,
  workbookFileToPayload,
} from "./changeCategorySheet.js";

describe("변승위 Category Excel 하이브리드 표", () => {
  it("Excel HTML의 셀 병합과 허용된 주요 서식을 구조화한다", () => {
    const sheet = parseChangeCategoryClipboard({
      html: `
        <style>.xl65 { background-color: #d9eaf7; font-weight: 700; text-align: center; }</style>
        <table><colgroup><col width="120"><col style="width:180px"></colgroup><tr height="28">
          <td class="xl65" colspan="2">변승위<br>Category</td>
        </tr><tr><td style="color:#123456">대분류</td><td>내용</td></tr></table>
      `,
      text: "대분류\t내용",
    });

    expect(sheet.columnWidths).toEqual([120, 180]);
    expect(sheet.rows[0].height).toBe(28);
    expect(sheet.rows[0].cells[0]).toMatchObject({
      text: "변승위\nCategory",
      colSpan: 2,
      style: { backgroundColor: "rgb(217, 234, 247)", fontWeight: "700", textAlign: "center" },
    });
    expect(sheet.rows[1].cells[0].style.color).toBe("rgb(18, 52, 86)");
  });

  it("HTML 표가 없으면 TSV를 표로 변환한다", () => {
    const sheet = parseChangeCategoryClipboard({ text: "대분류\t중분류\n설비\t점검" });
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[1].cells.map((cell) => cell.text)).toEqual(["설비", "점검"]);
  });

  it("셀 내용은 HTML로 실행하지 않고 텍스트로 렌더링한다", () => {
    const container = document.createElement("div");
    const rendered = renderChangeCategorySheet(container, {
      columnWidths: [100],
      rows: [{ height: 24, cells: [{ text: "<img src=x onerror=alert(1)>", rowSpan: 1, colSpan: 1, style: { color: "red" } }] }],
    });
    expect(rendered).toBe(true);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("td")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(container.querySelector("td")?.style.color).toBe("red");
  });

  it("XLSX 파일 시그니처와 크기를 검증해 base64 payload를 만든다", async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "변승위.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await expect(workbookFileToPayload(file)).resolves.toEqual({ name: "변승위.xlsx", dataBase64: "UEsDBA==" });
    await expect(workbookFileToPayload(new File(["not-xlsx"], "wrong.xlsx"))).rejects.toThrow("내용이 .xlsx 형식이 아닙니다");
    expect(formatCategoryFileSize(1536)).toBe("2 KB");
  });
});
