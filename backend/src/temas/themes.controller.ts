import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from '../catalogo/catalog.service';
@ApiTags('themes')
@Controller('themes')
export class ThemesController {
  constructor(private readonly catalog: CatalogService) {}
  @Get() @ApiOperation({ summary: 'Lista temas ativos' })
  list() { return this.catalog.listThemes().map((theme) => ({ id: theme.id, name: theme.nome, description: theme.descricao })); }
}
