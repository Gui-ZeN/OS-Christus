from pathlib import Path

from generate_manual_pdf import build_story, footer
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "manual-solicitante-usuario-serv3.md"
OUTPUT = ROOT / "docs" / "Manual_Solicitante_Usuario_Serv3.pdf"


def main():
    markdown = SOURCE.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="Manual do Solicitante e Usuario - Serv3",
        author="Serv3",
    )
    story = build_story(markdown)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"generated {OUTPUT}")


if __name__ == "__main__":
    main()

