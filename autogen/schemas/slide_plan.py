"""
schemas/slide_plan.py

KEY FIXES:
  1. SlideContent now carries the structured fields the ppt-generator reads:
       slide_number, slide_type, content (list of typed blocks).
  2. content[] entries are typed via _type discriminator
     ('subtitle' | 'kpi' | 'chart' | 'issue' | 'priority') so the
     generator can branch on them without guessing.
  3. chart_data is preserved on the slide for legacy debug/inspection, but
     the canonical chart payload now lives inside content[] as a chart block.
  4. bullets remain available as a fallback but are no longer the primary
     content carrier.
"""
from pydantic import BaseModel, Field
from typing import Literal, Optional, Any


class ContentBlock(BaseModel):
    """A single typed entry in slide.content[].

    The _type field is the discriminator the ppt-generator reads.
    Unused fields are simply left as None / empty.
    """
    type_: Literal['subtitleBlock', 'kpiItem', 'chartBlock', 'issueItem', 'priorityItem',
                   'subtitle', 'kpi', 'chart', 'issue', 'priority'] = Field(
        ..., alias='_type'
    )
    # subtitle / summary block
    text: Optional[str] = None
    # kpi block
    label: Optional[str] = None
    value: Optional[str] = None
    change: Optional[float] = None
    trend: Optional[str] = None
    # chart block — pptxgenjs series list: [{name, labels, values}, ...]
    chartData: Optional[list[dict[str, Any]]] = None
    # issue / priority block
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "allow"}


class SlideContent(BaseModel):
    # Generator contract
    slide_number: int = Field(..., ge=1, le=8)
    slide_type: Literal['title', 'kpi', 'trend', 'issue', 'insight', 'summary'] = 'kpi'

    # Display text
    title: str
    subtitle: str = ""

    # Structured payload — the generator's primary input
    content: list[ContentBlock] = Field(default_factory=list)

    # Legacy / fallback
    bullets: list[str] = Field(default_factory=list)
    chart_type: Literal["bar", "line", "pie", "table", "none"] = "none"
    chart_data: dict = Field(default_factory=dict)
    speaker_notes: str = ""


class SlidePlan(BaseModel):
    presentation_title: str
    period: str
    style: str = "executive"
    total_slides: int
    slides: list[SlideContent]
    narrative_arc: str = Field(..., description="One-paragraph story arc for the deck")
    recommended_duration_minutes: int = 20