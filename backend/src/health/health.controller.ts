import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { CatalogService } from '../catalogo/catalog.service';
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService, private readonly catalog: CatalogService) {}
  @Get() @ApiOperation({ summary: 'Verifica aplicação e banco' })
  async check(): Promise<{ status: string; database: string; catalog: { version: string; words: number; images: number; themes: number } }> {
    try { await this.database.query('SELECT 1'); return { status: 'ok', database: 'ok', catalog: { version: this.catalog.version, ...this.catalog.counts() } }; }
    catch { throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' }); }
  }
}
