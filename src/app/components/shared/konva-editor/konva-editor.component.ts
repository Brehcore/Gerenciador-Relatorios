import { Component, ElementRef, EventEmitter, Input, Output, AfterViewInit, OnDestroy, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import Konva from 'konva';

@Component({
  standalone: true,
  selector: 'app-konva-editor',
  imports: [CommonModule],
  templateUrl: './konva-editor.component.html',
  styleUrls: ['./konva-editor.component.css']
})
export class KonvaEditorComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() imageBase64: string | null = null;
  @Output() save = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('stageContainer', { static: true }) stageContainer!: ElementRef<HTMLDivElement>;

  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private imgNode: Konva.Image | null = null;

  // Tools state
  tool: 'pen' | 'circle' | 'rect' | 'arrow' | null = 'pen';
  strokeColor = '#ff0000';
  strokeWidth = 4;

  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private currentShape: any = null;

  // Undo / Redo
  private undoStack: any[] = [];
  private redoStack: any[] = [];

  ngAfterViewInit(): void {
    this.initStage();
  }

  ngOnDestroy(): void {
    try { this.stage?.destroy(); } catch(_) {}
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['imageBase64'] && this.imageBase64 && this.stage) {
      this.loadImage(this.imageBase64);
    }
  }

  private initStage(): void {
    const container = this.stageContainer?.nativeElement;
    if (!container) return;

    container.innerHTML = '';
    // Tamanhos reduzidos para modal mais compacto (coincide com CSS)
    const width = Math.min(560, window.innerWidth - 120);
    const height = Math.min(480, Math.floor(window.innerHeight * 0.65));

    this.stage = new Konva.Stage({ container: container, width, height });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Pointer handlers
    this.stage.on('mousedown touchstart', (ev: any) => {
      if ((ev && ev.evt && ev.evt.button === 2)) return;
      const pos = this.stage!.getPointerPosition();
      if (!pos) return;
      this.startX = pos.x; this.startY = pos.y; this.isDrawing = true; this.currentShape = null;

      const opts: any = { stroke: this.strokeColor, strokeWidth: this.strokeWidth, lineCap: 'round', lineJoin: 'round', draggable: false };

      switch (this.tool) {
        case 'pen':
          this.currentShape = new Konva.Line({ points: [pos.x, pos.y], ...opts, tension: 0, bezier: false });
          this.layer!.add(this.currentShape);
          break;
        case 'circle':
          this.currentShape = new Konva.Circle({ x: this.startX, y: this.startY, radius: 0, ...opts });
          this.layer!.add(this.currentShape);
          break;
        case 'rect':
          this.currentShape = new Konva.Rect({ x: this.startX, y: this.startY, width: 0, height: 0, ...opts });
          this.layer!.add(this.currentShape);
          break;
        case 'arrow':
          this.currentShape = new Konva.Arrow({ points: [this.startX, this.startY, this.startX, this.startY], pointerLength: 10, pointerWidth: 8, fill: this.strokeColor, stroke: this.strokeColor, strokeWidth: this.strokeWidth });
          this.layer!.add(this.currentShape);
          break;
      }
      this.layer!.batchDraw();
      // clear redo when new action
      this.redoStack = [];
    });

    this.stage.on('mousemove touchmove', () => {
      if (!this.isDrawing || !this.currentShape) return;
      const pos = this.stage!.getPointerPosition(); if (!pos) return;
      const x = pos.x; const y = pos.y;
      if (this.tool === 'pen') {
        const pts = (this.currentShape.points() as number[]).concat([x, y]);
        this.currentShape.points(pts);
      } else if (this.tool === 'circle') {
        const dx = x - this.startX; const dy = y - this.startY; const r = Math.sqrt(dx*dx + dy*dy);
        this.currentShape.radius(r);
      } else if (this.tool === 'rect') {
        const nx = Math.min(this.startX, x); const ny = Math.min(this.startY, y);
        const w = Math.abs(x - this.startX); const h = Math.abs(y - this.startY);
        this.currentShape.x(nx); this.currentShape.y(ny); this.currentShape.width(w); this.currentShape.height(h);
      } else if (this.tool === 'arrow') {
        this.currentShape.points([this.startX, this.startY, x, y]);
      }
      this.layer!.batchDraw();
    });

    this.stage.on('mouseup touchend', () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      if (this.currentShape) {
        // keep only drawings that are not the background image
        if (!(this.currentShape instanceof Konva.Image)) {
          this.undoStack.push(this.currentShape);
        }
        this.currentShape = null;
      }
      this.layer!.batchDraw();
    });

    if (this.imageBase64) this.loadImage(this.imageBase64);
  }

  private loadImage(dataUrl: string) {
    const img = new window.Image();
    img.onload = () => {
      if (!this.stage || !this.layer) return;
      // limpar layer e reinserir apenas a imagem base (desenhoss anteriores removidos)
      this.layer.destroyChildren();
      const scale = Math.min(this.stage.width() / img.width, this.stage.height() / img.height, 1);
      const imgW = img.width * scale;
      const imgH = img.height * scale;
      // centralizar a imagem dentro do stage
      const imgX = Math.max(0, Math.floor((this.stage.width() - imgW) / 2));
      const imgY = Math.max(0, Math.floor((this.stage.height() - imgH) / 2));
      this.imgNode = new Konva.Image({ image: img, x: imgX, y: imgY, width: imgW, height: imgH });
      this.layer.add(this.imgNode);
      this.layer.draw();
      // limpar pilhas de undo/redo quando uma nova imagem é carregada
      this.undoStack = []; this.redoStack = [];
    };
    img.src = dataUrl;
  }

  clearDrawings(): void {
    if (!this.layer) return;
    const children = this.layer.getChildren() as any[];
    children.forEach((c: any) => { if (!(c instanceof Konva.Image)) c.destroy(); });
    this.layer.draw();
    this.undoStack = []; this.redoStack = [];
  }

  undoLast(): void {
    if (!this.layer || this.undoStack.length === 0) return;
    const item = this.undoStack.pop();
    if (item) { item.destroy(); this.redoStack.push(item); }
    this.layer.batchDraw();
  }

  redoLast(): void {
    if (!this.layer || this.redoStack.length === 0) return;
    const item = this.redoStack.pop();
    if (item) { this.layer.add(item); this.undoStack.push(item); }
    this.layer.batchDraw();
  }

  setTool(t: 'pen'|'circle'|'rect'|'arrow') { this.tool = t; }

  setColor(hex: string) { this.strokeColor = hex; }
  setWidth(w: number) { this.strokeWidth = w; }

  saveImage(): void {
    if (!this.stage) return;
    // If we have the image node, export only the image bounding box (photo + drawings)
    if (this.imgNode) {
      const imgX = Math.round(this.imgNode.x() || 0);
      const imgY = Math.round(this.imgNode.y() || 0);
      const imgW = Math.round(this.imgNode.width() || 0);
      const imgH = Math.round(this.imgNode.height() || 0);
      if (imgW > 0 && imgH > 0) {
        const dataUrl = this.stage.toDataURL({ x: imgX, y: imgY, width: imgW, height: imgH, mimeType: 'image/jpeg', quality: 0.9 });
        this.save.emit(dataUrl);
        return;
      }
    }
    // Fallback: export whole stage
    const dataUrl = this.stage.toDataURL({ mimeType: 'image/jpeg', quality: 0.9 });
    this.save.emit(dataUrl);
  }

  cancelEdit(): void {
    this.cancel.emit();
  }
}
