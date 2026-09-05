/**
 * @xietuier/matrix-rain · WebGPU 类型声明 (0.4.0+ Phase 4)
 *
 * 最小 WebGPU 接口声明，避免引入整个 @webgpu/types 依赖。
 * 只声明 webgpu-renderer.ts 实际使用的类型。
 *
 * @since 0.4.0
 */

// ============ 顶层 GPU ============

export type GpuNavigator = {
  gpu?: GPU;
};

export type GPU = {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
  wgslLanguageFeatures?: { size: number };
};

export type GPURequestAdapterOptions = {
  powerPreference?: 'low-power' | 'high-performance';
};

// ============ Adapter / Device ============

export type GPUAdapter = {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  features: GPUSupportedFeatures;
  limits: GPUSupportedLimits;
  info: GPUAdapterInfo;
};

export type GPUAdapterInfo = {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
};

export type GPUSupportedFeatures = {
  has(feature: string): boolean;
};

export type GPUSupportedLimits = {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  maxComputeWorkgroupsPerDimension: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeInvocationsPerWorkgroup: number;
};

export type GPUDeviceDescriptor = {
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
};

export type GPUFeatureName = string;

export type GPUDevice = {
  queue: GPUQueue;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createSampler(descriptor: GPUSamplerDescriptor): GPUSampler;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  // 0.6.0+: 错误 scope(用于真实调试)
  pushErrorScope(filter: 'validation' | 'out-of-memory' | 'internal'): void;
  popErrorScope(): Promise<GPUError | null>;
  destroy(): void;
  // 0.7.1+ P0-2: 设备丢失监听(规范: device.lost 一定 resolve, 不 reject)
  lost: Promise<GPUDeviceLostInfo>;
};

export type GPUDeviceLostInfo = {
  reason: 'destroyed' | 'unknown' | string;
  message: string;
};

export type GPUError = {
  message: string;
};

// ============ Queue ============

export type GPUQueue = {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  copyExternalImageToTexture(
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTextureTagged,
    copySize: GPUExtent3D
  ): void;
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: BufferSource,
    dataOffset?: number,
    size?: number
  ): void;
};

export type GPUImageCopyExternalImage = {
  source: ImageBitmap | HTMLImageElement | HTMLVideoElement | OffscreenCanvas | HTMLCanvasElement;
  origin?: GPUOrigin2D;
  flipY?: boolean;
};

export type GPUImageCopyTextureTagged = {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: GPUTextureAspect;
  colorSpace?: GPUPredefinedColorSpace;
  premultipliedAlpha?: boolean;
};

export type GPUOrigin2D = { x?: number; y?: number };

export type GPUOrigin3D = { x?: number; y?: number; z?: number };

export type GPUExtent3D = {
  width: number;
  height?: number;
  depthOrArrayLayers?: number;
};

export type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';

export type GPUPredefinedColorSpace = 'srgb' | 'display-p3';

// ============ Buffers ============

export type GPUBuffer = {
  destroy(): void;
  mapAsync(mode: GPUMapModeFlags): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  size: number;
  usage: number;
  mapState: 'unmapped' | 'pending' | 'mapped';
};

export type GPUBufferDescriptor = {
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
  label?: string;
};

export type GPUMapModeFlags = number;

// ============ Textures ============

export type GPUTexture = {
  width: number;
  height: number;
  depthOrArrayLayers: number;
  mipLevelCount: number;
  sampleCount: number;
  dimension: GPUTextureDimension;
  format: GPUTextureFormat;
  usage: number;
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
};

export type GPUTextureView = {};

export type GPUTextureDescriptor = {
  size: GPUExtent3D;
  mipLevelCount?: number;
  sampleCount?: number;
  dimension?: GPUTextureDimension;
  format: GPUTextureFormat;
  usage: number;
  label?: string;
};

export type GPUTextureDimension = '1d' | '2d' | '3d';

export type GPUTextureViewDescriptor = {
  format?: GPUTextureFormat;
  dimension?: GPUTextureViewDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayer?: number;
  arrayLayerCount?: number;
};

export type GPUTextureViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';

// ============ Sampler ============

export type GPUSampler = {};

export type GPUSamplerDescriptor = {
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  addressModeW?: GPUAddressMode;
  magFilter?: GPUFilterMode;
  minFilter?: GPUFilterMode;
  mipmapFilter?: GPUMipmapFilterMode;
  lodMinClamp?: number;
  lodMaxClamp?: number;
  compare?: GPUCompareFunction;
  maxAnisotropy?: number;
};

export type GPUAddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';

export type GPUMipmapFilterMode = 'nearest' | 'linear';

export type GPUCompareFunction =
  | 'never'
  | 'less'
  | 'equal'
  | 'less-equal'
  | 'greater'
  | 'not-equal'
  | 'greater-equal'
  | 'always';

export type GPUFilterMode = 'nearest' | 'linear';

// ============ Command Encoding ============

export type GPUCommandEncoderDescriptor = {
  label?: string;
};

export type GPUCommandEncoder = {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
  copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number
  ): void;
  copyBufferToTexture(
    source: GPUImageCopyBuffer,
    destination: GPUImageCopyTexture,
    copySize: GPUExtent3D
  ): void;
  clearBuffer(buffer: GPUBuffer, offset?: number, size?: number): void;
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
};

export type GPUCommandBufferDescriptor = {
  label?: string;
};

export type GPUCommandBuffer = {};

export type GPUImageCopyBuffer = {
  buffer: GPUBuffer;
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
};

export type GPUImageCopyTexture = {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: GPUTextureAspect;
};

// ============ Render Pass ============

export type GPURenderPassDescriptor = {
  colorAttachments: GPURenderPassColorAttachment[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  label?: string;
};

export type GPURenderPassColorAttachment = {
  view: GPUTextureView;
  resolveTarget?: GPUTextureView;
  clearValue?: GPUColor;
  loadOp: GPULoadOp;
  storeOp: GPUStoreOp;
};

export type GPUColor = { r: number; g: number; b: number; a: number };

export type GPULoadOp = 'load' | 'clear';

export type GPUStoreOp = 'store' | 'discard';

export type GPURenderPassDepthStencilAttachment = {
  view: GPUTextureView;
  depthClearValue?: number;
  depthLoadOp?: GPULoadOp;
  depthStoreOp?: GPUStoreOp;
  depthReadOnly?: boolean;
  stencilClearValue?: number;
  stencilLoadOp?: GPULoadOp;
  stencilStoreOp?: GPUStoreOp;
  stencilReadOnly?: boolean;
};

export type GPURenderPassEncoder = {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  setIndexBuffer(
    buffer: GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: number,
    size?: number
  ): void;
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number
  ): void;
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number
  ): void;
  end(): void;
};

export type GPUIndexFormat = 'uint16' | 'uint32';

export type GPUComputePassDescriptor = {
  label?: string;
  timestampWrites?: [];
};

export type GPUComputePassEncoder = {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]): void;
  dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number
  ): void;
  end(): void;
};

// ============ Bind Groups ============

export type GPUBindGroupDescriptor = {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
  label?: string;
};

export type GPUBindGroupEntry = {
  binding: number;
  resource: GPUBindingResource;
};

export type GPUBindingResource =
  | { buffer: GPUBuffer; offset?: number; size?: number }
  | GPUTextureView
  | GPUSampler
  | GPUExternalTexture;

export type GPUExternalTexture = {};

export type GPUBindGroupLayoutDescriptor = {
  entries: GPUBindGroupLayoutEntry[];
  label?: string;
};

export type GPUBindGroupLayoutEntry = {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
  texture?: GPUTextureBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  storageTexture?: GPUStorageTextureBindingLayout;
  externalTexture?: {};
};

export type GPUBufferBindingLayout = {
  type?: 'uniform' | 'storage' | 'read-only-storage';
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
};

export type GPUTextureBindingLayout = {
  sampleType?: 'float' | 'unfilterable-float' | 'sint' | 'uint' | 'depth';
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
};

export type GPUSamplerBindingLayout = {
  type?: 'filtering' | 'non-filtering' | 'comparison';
};

export type GPUStorageTextureBindingLayout = {
  access?: 'write-only' | 'read-only' | 'read-write';
  format: GPUTextureFormat;
  viewDimension?: GPUTextureViewDimension;
};

export type GPUBindGroup = {};

export type GPUBindGroupLayout = {};

// ============ Pipeline ============

export type GPUPipelineLayoutDescriptor = {
  bindGroupLayouts: GPUBindGroupLayout[];
  label?: string;
};

export type GPUPipelineLayout = {};

export type GPURenderPipelineDescriptor = {
  layout: GPUPipelineLayout | 'auto';
  vertex: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
  label?: string;
};

export type GPUVertexState = {
  module: GPUShaderModule;
  entryPoint: string;
  buffers?: GPUVertexBufferLayout[];
};

export type GPUFragmentState = {
  module: GPUShaderModule;
  entryPoint: string;
  targets: GPUColorTargetState[];
};

export type GPUColorTargetState = {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
  writeMask?: GPUColorWriteFlags;
};

export type GPUBlendState = {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
};

export type GPUBlendComponent = {
  operation?: GPUBlendOperation;
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
};

export type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';

export type GPUBlendFactor =
  | 'zero'
  | 'one'
  | 'src'
  | 'one-minus-src'
  | 'src-alpha'
  | 'one-minus-src-alpha'
  | 'dst'
  | 'one-minus-dst'
  | 'dst-alpha'
  | 'one-minus-dst-alpha'
  | 'src-alpha-saturated'
  | 'constant'
  | 'one-minus-constant';

export type GPUColorWriteFlags = number;

export type GPUPrimitiveState = {
  topology?: GPUPrimitiveTopology;
  stripIndexFormat?: GPUIndexFormat;
  frontFace?: GPUFrontFace;
  cullMode?: GPUCullMode;
};

export type GPUPrimitiveTopology =
  | 'point-list'
  | 'line-list'
  | 'line-strip'
  | 'triangle-list'
  | 'triangle-strip';

export type GPUFrontFace = 'ccw' | 'cw';

export type GPUCullMode = 'none' | 'front' | 'back';

export type GPUDepthStencilState = {
  format: GPUTextureFormat;
  depthWriteEnabled?: boolean;
  depthCompare?: GPUCompareFunction;
  stencilFront?: GPUStencilFaceState;
  stencilBack?: GPUStencilFaceState;
  stencilReadMask?: number;
  stencilWriteMask?: number;
  depthBias?: number;
  depthBiasSlopeScale?: number;
  depthBiasClamp?: number;
};

export type GPUStencilFaceState = {
  compare?: GPUCompareFunction;
  failOp?: GPUStencilOperation;
  depthFailOp?: GPUStencilOperation;
  passOp?: GPUStencilOperation;
};

export type GPUStencilOperation =
  | 'keep'
  | 'zero'
  | 'replace'
  | 'invert'
  | 'increment-clamp'
  | 'decrement-clamp'
  | 'increment-wrap'
  | 'decrement-wrap';

export type GPUMultisampleState = {
  count?: number;
  mask?: number;
  alphaToCoverageEnabled?: boolean;
};

export type GPUComputePipelineDescriptor = {
  layout: GPUPipelineLayout | 'auto';
  compute: GPUProgrammableStage;
  label?: string;
};

export type GPUProgrammableStage = {
  module: GPUShaderModule;
  entryPoint: string;
  constants?: Record<string, number>;
};

export type GPUShaderModuleDescriptor = {
  code: string;
  sourceMap?: object;
  label?: string;
};

export type GPUShaderModule = {};

export type GPUVertexBufferLayout = {
  arrayStride: number;
  stepMode?: GPUVertexStepMode;
  attributes: GPUVertexAttribute[];
};

export type GPUVertexStepMode = 'vertex' | 'instance';

export type GPUVertexAttribute = {
  format: GPUVertexFormat;
  offset: number;
  shaderLocation: number;
};

export type GPUVertexFormat =
  | 'float32'
  | 'float32x2'
  | 'float32x3'
  | 'float32x4'
  | 'sint32'
  | 'sint32x2'
  | 'sint32x3'
  | 'sint32x4'
  | 'uint32'
  | 'uint32x2'
  | 'uint32x3'
  | 'uint32x4';

export type GPURenderPipeline = {};

export type GPUComputePipeline = {};

export type GPUTextureFormat = string;

// ============ Canvas Context ============

export type GPUCanvasContext = {
  configure(configuration: GPUCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
  canvas: HTMLCanvasElement | OffscreenCanvas;
};

export type GPUCanvasConfiguration = {
  device: GPUDevice;
  format: GPUTextureFormat;
  usage?: number;
  viewFormats?: GPUTextureFormat[];
  colorSpace?: GPUPredefinedColorSpace;
  alphaMode?: GPUCanvasAlphaMode;
};

export type GPUCanvasAlphaMode = 'opaque' | 'premultiplied';

// ============ 常量 ============

export const GPUBufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
} as const;

export const GPUShaderStage = {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4,
} as const;

export const GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
} as const;

export const GPUColorWrite = {
  RED: 0x1,
  GREEN: 0x2,
  BLUE: 0x4,
  ALPHA: 0x8,
  ALL: 0xf,
} as const;

export const GPUMapMode = {
  READ: 0x0001,
  WRITE: 0x0002,
} as const;
