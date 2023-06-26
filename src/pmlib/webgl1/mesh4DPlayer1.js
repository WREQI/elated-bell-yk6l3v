import { webglUtil } from "./util/webglutil";
import { Shader } from "./util/shader";
const width = 1024;
const height = 1024;
var videoPause = false;
let THREE, gl;

let urlRoot;
let mesh_boxs, mesh_frames;

let last_time;

let frameIndex = -1;
let nb_frames;
let last_date;

let maxVeretxCount;
let keepAllMeshesInMemory = false;
let jsonBuffers;
let arrayBuffers = [null, null, null];
let freeArrayBuffers = [];
let nextBufferLoadIndex = 0;
let currentBufferIndex = 0;
let pendingBufferDownload;

//texture
let copyVideo = false;
let video;
let nextPbo = 0;
let watermarkPixels = new Uint8Array(width * 4);

let readyToPlay = false;
let firstFrames;
let lastFirstFrameIdx = -1;
let reloadFirstFrame = false;
let count = 0;
let visibilitychange = false;

let lastRenderFrameIndex = 0;
const nextRenderFrameCount = 20;
let needRenderLastFrame = false;
//firefox
let skipFrameCountInFirefox = 0;
let wegblErrorCount = 0;
let videoFps = 22.0;
let onload;
let time_;
let mesh_ = false;
const baseUrl = "https://holodata.s3.cn-northwest-1.amazonaws.com.cn";
class mesh4DPlayer {
  static install(three) {
    THREE = three;
  }
  static listener = true;

  constructor(renderer, options) {
    gl = renderer.getContext();
    this.renderer = renderer;
    this.isWebGL2 = true;
    this.isOSVersion = false;
    this.stream = options.stream;
    this.openLoop = options.loop;
    this.videoEndEvent = false;
    this.mesh = false;
    this.firefox = navigator.userAgent.indexOf("Firefox") != -1;
    if (!this.isWebGL2) {
      const V1 = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      const V2 = gl.getParameter(gl.VERSION);
      const available_extensions = gl.getSupportedExtensions();
      console.log("gl_VERSION", V1, "\n", V2, this.isWebGL2);
      console.log("WebGL extensions", available_extensions);
      this.vaoExt = gl.getExtension("OES_vertex_array_object");
    }
    //初始化Three网格
    this.initGeoMesh();
    this.initWebgl();
    this.initVideo();
  }
  initVideo() {
    const that = this;
    const video = document.createElement("video");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("playsinline", "playsinline");
    video.setAttribute("x5-playsinline", "true");
    video.setAttribute("x5-video-player-type", "h5-page");
    video.crossOrigin = "anonymous";
    video.autoplay = false;
    video.muted = true;
    video.loop = false;

    let playing = false;
    let canplay = false;
    function checkReady() {
      if (playing && canplay) {
        copyVideo = true;
      }
    }
    video.addEventListener(
      "playing",
      function () {
        playing = true;
        checkReady();
      },
      true
    );
    video.addEventListener(
      "canplay",
      function () {
        canplay = true;
        checkReady();
      },
      true
    );
    video.addEventListener("timeupdate", function () {});
    video.addEventListener(
      "ended",
      function () {
        //结束
        //关闭循环播放，暂停
        if (!that.openLoop && !videoPause) {
          console.log("播放结束");
          // pause0(video)
          that.pause();
        }
        if (that.videoEndEvent) {
          that.videoEndEvent();
        }
      },
      false
    );
    listener(video);
    this.video = video;
  }
  createGlProgram() {
    const vertex = this.isWebGL2 ? Shader.vertextSource : Shader.vertextSource1;
    const fragment = this.isWebGL2
      ? Shader.fragmentSource
      : Shader.fragmentSource1;
    const vertexShader = webglUtil.createShader(gl, gl.VERTEX_SHADER, vertex);
    const fragmentShader = webglUtil.createShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragment
    );
    this.program = webglUtil.createProgram(
      gl,
      vertexShader,
      fragmentShader,
      this.isWebGL2
    );
  }
  createVao() {
    if (this.isWebGL2) {
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
    } else {
      this.vao = this.vaoExt.createVertexArrayOES();
      this.vaoExt.bindVertexArrayOES(this.vao);
    }
  }
  initWebgl() {
    const numAsyncFrames = 3;
    //初始化着色程序
    this.createGlProgram();
    //初始化着色器位置属性
    this.posLocation = gl.getAttribLocation(this.program, "pos");
    this.weightsLocation = gl.getAttribLocation(this.program, "weights");
    this.boneIdsLocation = gl.getAttribLocation(this.program, "boneIds");
    this.boneMatrixImageLocation = gl.getUniformLocation(
      this.program,
      "boneMatrixImage"
    );
    //初始化缓冲区
    this.createVao();
    this.glPosBuf = gl.createBuffer();
    this.glWeightBuf = gl.createBuffer();
    this.glBondidxBuf = gl.createBuffer();
    this.fbo1 = gl.createFramebuffer();
    this.fbo2 = gl.createFramebuffer();
    //初始化FBO纹理
    this.pixelBuffers = Array(numAsyncFrames);
    this.readFences = Array(numAsyncFrames);
    this.textures = Array(numAsyncFrames);
    const d = gl.getParameter(gl.TEXTURE_BINDING_2D);
    for (let e = 0; e < this.textures.length; ++e) {
      this.textures[e] = webglUtil.createTexture(gl, false);
      gl.bindTexture(gl.TEXTURE_2D, d);
    }
    //初始化骨骼纹理
    gl.activeTexture(gl.TEXTURE0);
    this.max_bones = 60;
    this.boneMatrixTexture = webglUtil.createTexture(gl, this.max_bones);
    this.pixelData = new Float32Array(this.max_bones * 16);
  }
  initGeoMesh() {
    //创建几何
    const bufferGeometry = new THREE.BufferGeometry();
    //创建绑定位置缓冲
    const geoPosBuf = gl.createBuffer();
    const posAttr = new THREE.GLBufferAttribute(geoPosBuf, gl.FLOAT, 3, 0);
    bufferGeometry.setAttribute("position", posAttr);
    //创建绑定uv缓冲
    const geoUvBuf = gl.createBuffer();
    const uvAttr = new THREE.GLBufferAttribute(geoUvBuf, gl.FLOAT, 2, 0);
    bufferGeometry.setAttribute("uv", uvAttr);
    //创建绑定索引缓冲
    const geoIndiceBuf = gl.createBuffer();
    const indAttr = new THREE.GLBufferAttribute(
      geoIndiceBuf,
      gl.UNSIGNED_SHORT,
      0,
      0
    );
    bufferGeometry.setIndex(indAttr);
    //创建Three纹理
    const texture = new THREE.Texture();
    const texProps = this.renderer.properties.get(texture);
    //创建webgl纹理绑定到Three纹理
    const saveTex = gl.getParameter(gl.TEXTURE_BINDING_2D);

    const glTexture = webglUtil.createTexture(gl, 2);
    texProps.__webglTexture = glTexture;

    gl.bindTexture(gl.TEXTURE_2D, saveTex);
    //创建three材质
    const material = new THREE.MeshBasicMaterial();
    material.side = THREE.DoubleSide;
    material.transparent = false;
    material.map = texture;
    //创建网格
    const mesh = new THREE.Mesh(bufferGeometry, material);
    mesh.frustumCulled = false;

    this.webglTexture = texProps.__webglTexture;
    this.geoPosBuf = geoPosBuf;
    this.geoUvBuf = geoUvBuf;
    this.geoIndiceBuf = geoIndiceBuf;
    this.mesh = mesh;
    mesh_ = mesh;
  }
  load(urlRoot1, onload1) {
    const that = this;
    onload = onload1;
    urlRoot = urlRoot1;
    let info_fn = urlRoot + "/mesh.json";
    fetch(info_fn)
      .then(function (response) {
        return response.json();
      })
      .then(function (json) {
        mesh_boxs = json.boxs;
        mesh_frames = json.frames;
        nb_frames = mesh_frames.length;
        maxVeretxCount = json.maxVertexCount;
        firstFrames = json.firstFrames;
        jsonBuffers = json.buffers;
        for (var i = 0; i < arrayBuffers.length; ++i) {
          freeArrayBuffers.push(i);
        }
        console.log(
          "json",
          json,
          " frames length ",
          nb_frames,
          " json buffer length ",
          jsonBuffers.length
        );
        that.initTransform();
        const url = urlRoot + "/" + json.mp4Url;
        video = that.setupVideo(url);
        const mesh = that.mesh;
        if (onload) onload(mesh, false);
        that.loadNextBuffer();
      });
  }
  initTransform() {
    this.outputBuffer = gl.createBuffer();
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.outputBuffer);
    gl.bufferData(
      gl.TRANSFORM_FEEDBACK_BUFFER,
      12 * maxVeretxCount,
      gl.STREAM_COPY
    );
    if (this.isWebGL2) {
      this.transformFeedback = gl.createTransformFeedback();
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.outputBuffer);
    }
  }
  setupVideo(url) {
    const video = this.video;
    video.src = url;
    return video;
  }
  updateVao(current_frame, mesh_buffers, arrayBufferIndex) {
    if (current_frame.isFirstFrame == "true" || reloadFirstFrame) {
      //update f uv pos weight indices
      const f = new Uint16Array(
        mesh_buffers,
        mesh_boxs[current_frame.f].start_byte,
        mesh_boxs[current_frame.f].count * 3
      );
      const pos = new Float32Array(
        mesh_buffers,
        mesh_boxs[current_frame.pos].start_byte,
        mesh_boxs[current_frame.pos].count * 3
      );
      const uv = new Float32Array(
        mesh_buffers,
        mesh_boxs[current_frame.tc].start_byte,
        mesh_boxs[current_frame.tc].count * 2
      );
      const weights = new Float32Array(
        mesh_buffers,
        mesh_boxs[current_frame.weights].start_byte,
        mesh_boxs[current_frame.weights].count * 4
      );
      const indices = new Float32Array(
        mesh_buffers,
        mesh_boxs[current_frame.indices].start_byte,
        mesh_boxs[current_frame.indices].count * 4
      );
      this.nb_triangles = f.length / 3;
      this.nb_vertexs = pos.length / 3;
      this.createVao();
      //更新顶点坐标
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glPosBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.posLocation);
      gl.vertexAttribPointer(this.posLocation, 3, gl.FLOAT, false, 0, 0);
      //更新面索引
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.geoIndiceBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, f, gl.STATIC_DRAW);
      //更新uv坐标
      gl.bindBuffer(gl.ARRAY_BUFFER, this.geoUvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      //更新骨骼权重
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glWeightBuf);
      gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.weightsLocation);
      gl.vertexAttribPointer(this.weightsLocation, 4, gl.FLOAT, false, 0, 0);
      //更新骨骼索引
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBondidxBuf);
      gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.boneIdsLocation);
      gl.vertexAttribPointer(this.boneIdsLocation, 4, gl.FLOAT, false, 0, 0);

      //load new bin file
      if (arrayBufferIndex != currentBufferIndex) {
        if (currentBufferIndex == -1) {
          currentBufferIndex = arrayBufferIndex;
        } else {
          if (!keepAllMeshesInMemory) {
            const gapVal = this.checkLastAndCurrentBufferGap(
              currentBufferIndex,
              arrayBufferIndex
            );
            for (let i = 0; i < gapVal.length; i++) {
              freeArrayBuffers.push(gapVal[i]);
            }
          }
          currentBufferIndex = arrayBufferIndex;
          if (!pendingBufferDownload) {
            this.loadNextBuffer();
          }
        }
      }
    }
    if (this.isWebGL2) {
      gl.bindVertexArray(this.vao);
    } else if (this.vaoExt) {
      this.vaoExt.bindVertexArray(this.vao);
    }
  }
  update() {
    if (videoPause) {
      // console.log('我是暂停播放2222')
      return;
    }
    if (copyVideo && video) {
      let this_time = new Date().getTime(); // 获取当前时间（毫秒）
      let speed_time = this_time - last_time; // 计算时间差
      if (speed_time < 20) return; // 如果时间差小于 20 毫秒，直接返回
      last_time = this_time; // 更新上一次的时间
      if (!this.checkNextMeshReady()) {
        // 如果下一个 mesh 没有准备好
        if (!video.paused) {
          // 如果视频没有暂停
          var time = lastRenderFrameIndex / videoFps; // 计算当前时间
          video.currentTime = time; // 设置视频当前播放时间
          video.pause(); // 暂停视频播放
        }
      } else {
        // 如果下一个 mesh 准备好了
        if (video.paused) {
          // 如果视频已经暂停
          video.play(); // 开始播放视频
        }
      }
      if (this.firefox && skipFrameCountInFirefox > 0) {
        needRenderLastFrame = true;
        skipFrameCountInFirefox--;
      }

      var saveFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING); // 获取当前帧缓冲对象
      var saveTex = gl.getParameter(gl.TEXTURE_BINDING_2D); // 获取当前纹理对象
      var savePbo = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING); // 获取当前像素缓冲区对象
      var p = (nextPbo + 1) % this.pixelBuffers.length; // 计算下一个像素缓冲区

      if (null != this.readFences[p]) {
        // 如果读取的纹理缓冲区不为空
        if (this.isWebGL2) {
          //webgl2
          gl.getSyncParameter(this.readFences[p], gl.SYNC_STATUS); // 获取同步状态
          if (!needRenderLastFrame) {
            // 如果不需要渲染最后一帧
            //webgl2
            gl.deleteSync(this.readFences[p]); // 删除同步对象
            this.readFences[p] = null; // 将同步对象置为空
            // console.log('我是设置为了空',this.readFences[p])
          } else {
            // console.log('我是设置为了空222222222222',this.readFences[p])
          }
        }

        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pixelBuffers[p]); // 绑定像素缓冲区
        //webgl2
        gl.getBufferSubData(
          gl.PIXEL_PACK_BUFFER,
          0,
          watermarkPixels,
          0,
          watermarkPixels.byteLength
        ); // 从像素缓冲区中获取数据
        // 解绑像素缓冲区对象
        // gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        //gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        //gl.readPixels(0, 0, watermarkPixels.byteLength / 4, 1, gl.RGBA, gl.UNSIGNED_BYTE, watermarkPixels); // 从帧缓冲区中读取像素数据
        frameIndex = 0; // 帧索引初始化为 0
        for (let a = 0; 16 > a; ++a) {
          // 遍历 16 个像素
          if (
            128 < watermarkPixels[4 * a] ||
            128 < watermarkPixels[4 * a + 1]
          ) {
            // 如果像素值大于 128
            frameIndex += 1 << a; // 更新帧索引
          }
        }
        lastRenderFrameIndex = frameIndex; // 更新上一次渲染的帧索引
      }

      if (this.pixelBuffers[nextPbo] == null) {
        // 如果下一个像素缓冲区为空
        this.pixelBuffers[nextPbo] = gl.createBuffer(); // 创建一个像素缓冲区
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pixelBuffers[nextPbo]); // 绑定像素缓冲区
        gl.bufferData(
          gl.PIXEL_PACK_BUFFER,
          watermarkPixels.byteLength,
          gl.DYNAMIC_READ
        ); // 填充像素缓冲区
      }
      if (!needRenderLastFrame) {
        // 如果不需要渲染最后一帧
        gl.bindTexture(gl.TEXTURE_2D, this.textures[nextPbo]); // 绑定纹理对象
        let error = gl.getError(); // 获取 WebGL 错误
        if (error != gl.NO_ERROR) {
          // 如果存在 WebGL 错误
          if (wegblErrorCount % 500 == 0) {
            // 每 500 次错误输出一次日志
          }
          wegblErrorCount++; // 错误计数器加一
          gl.bindTexture(gl.TEXTURE_2D, null); // 解绑纹理对象
        }
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          video
        ); // 将视频帧写入纹理
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo1); // 绑定帧缓冲区
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          this.textures[nextPbo],
          0
        ); // 将纹理附加到帧缓冲区
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pixelBuffers[nextPbo]); // 绑定像素缓冲区
        gl.readPixels(
          0,
          0,
          watermarkPixels.byteLength / 4,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          0
        ); // 从帧缓冲区中读取像素数据
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // 解绑帧缓冲区
        if (gl.getError() == gl.NO_ERROR) {
          // 如果不存在 WebGL 错误
          //webgl2
          this.readFences[nextPbo] = gl.fenceSync(
            gl.SYNC_GPU_COMMANDS_COMPLETE,
            0
          ); // 创建同步对象
          nextPbo = (nextPbo + 1) % this.pixelBuffers.length; // 更新下一个像素缓冲区的索引
        } else {
          // 如果存在 WebGL 错误
          if (wegblErrorCount % 50 == 0) {
            // 每 50 次错误输出一次日志
          }
          wegblErrorCount++; // 错误计数器加一
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, savePbo); // 绑定之前的像素缓冲区
      }
      //console.log('我是数据哈哈ddd')
      if (-1 < frameIndex) {
        // 如果帧索引大于等于 0
        // console.log('更新网格',video.currentTime)
        this.updateMesh(); // 更新网格信息
        if (this.isWebGL2) {
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo1); // 绑定读取帧缓冲区
          gl.framebufferTexture2D(
            gl.READ_FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            this.textures[p],
            0
          ); // 将纹理附加到读取帧缓冲区
          //webgl2
          gl.readBuffer(gl.COLOR_ATTACHMENT0); // 读取颜色缓冲区
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo2); // 绑定绘制帧缓冲区
          gl.framebufferTexture2D(
            gl.DRAW_FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            this.webglTexture,
            0
          ); // 将 Webgl 纹理附加到绘制帧缓冲区
          //webgl2
          gl.drawBuffers([gl.COLOR_ATTACHMENT0]); // 设置绘制缓冲区
          //webgl2
          gl.blitFramebuffer(
            0,
            0,
            width,
            height,
            0,
            0,
            width,
            height,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST
          ); // 将读取帧缓冲区的像素数据拷贝到绘制帧缓冲区
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, saveFbo); // 绑定保存帧缓冲区
      gl.bindTexture(gl.TEXTURE_2D, saveTex); // 绑定保存纹理对象
    }
  }
  updateFbo(p) {
    // 将纹理对象附加到读取帧缓冲区的颜色附着点上
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo1);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.textures[p],
      0
    );
    // 使用 gl.readPixels 方法读取读取帧缓冲区中的像素数据
    const pixelBuffer = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo1);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
    // 将像素数据转换为目标格式，并将其存储到一个临时的 ArrayBufferView 对象中
    const tempBuffer = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      tempBuffer[i * 4] = pixelBuffer[i * 4 + 2];
      tempBuffer[i * 4 + 1] = pixelBuffer[i * 4 + 1];
      tempBuffer[i * 4 + 2] = pixelBuffer[i * 4];
      tempBuffer[i * 4 + 3] = pixelBuffer[i * 4 + 3];
    }
    // 将临时的 ArrayBufferView 对象绑定到 WebGL 上下文的一个 ArrayBuffer 绑定点上
    const tempBufferObject = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tempBufferObject);
    gl.bufferData(gl.ARRAY_BUFFER, tempBuffer, gl.STATIC_DRAW);
    // 将 WebGL 纹理对象附加到绘制帧缓冲区的颜色附着点上
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.webglTexture,
      0
    );
    // 使用 gl.texImage2D 方法将 ArrayBufferView 对象中的像素数据存储到 WebGL 纹理对象中
    gl.bindTexture(gl.TEXTURE_2D, this.webglTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      tempBuffer
    );
    // 释放临时的资源
    // gl.deleteFramebuffer(this.fbo1);
    // gl.deleteFramebuffer(this.fbo2);
    gl.deleteBuffer(tempBufferObject);
  }
  updateMesh() {
    const current_frame = mesh_frames[frameIndex];
    if (!current_frame) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    last_date = new Date().getTime();
    // console.log('jsonBuffers[mesh_frames[frameIndex].binFileIdx]',frameIndex,mesh_frames[frameIndex])
    const arrayBufferIndex =
      jsonBuffers[mesh_frames[frameIndex].binFileIdx].arrayBufferIndex;
    const mesh_buffers = arrayBuffers[arrayBufferIndex];
    //当前帧是首帧
    if (current_frame.isFirstFrame != "true") {
      const idx = this.seekNearestFirstFrame(frameIndex, firstFrames);
      if (idx != lastFirstFrameIdx) {
        reloadFirstFrame = true;
        lastFirstFrameIdx = idx;
      } else {
        reloadFirstFrame = false;
      }
    } else {
      lastFirstFrameIdx = frameIndex;
    }
    this.updateVao(current_frame, mesh_buffers, arrayBufferIndex);
    //update deformation
    //更新骨骼纹理数据
    this.updateBoneTexture(current_frame, mesh_buffers);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.outputBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    //webgl2
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
    // return;
    gl.enable(gl.RASTERIZER_DISCARD);
    //webgl2
    gl.beginTransformFeedback(gl.POINTS);

    gl.drawArrays(gl.POINTS, 0, this.nb_vertexs);
    //webgl2
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);

    const bufferSize = this.nb_vertexs * 12;
    gl.bindBuffer(gl.COPY_READ_BUFFER, this.outputBuffer);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this.geoPosBuf);
    //webgl2
    gl.bufferData(gl.COPY_WRITE_BUFFER, bufferSize, gl.DYNAMIC_COPY);
    //webgl2
    gl.copyBufferSubData(
      gl.COPY_READ_BUFFER,
      gl.COPY_WRITE_BUFFER,
      0,
      0,
      bufferSize
    );
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);

    //console.log('draw mesh index', frameIndex, ' done! ');
    //bufferGeometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.index.count = this.nb_triangles * 3;
  }
  updateBoneTexture(current_frame, mesh_buffers) {
    const nb_bones = mesh_boxs[current_frame.deformation].count;
    const pixelData = this.pixelData;
    const start_byte = mesh_boxs[current_frame.deformation].start_byte;
    const deform = new Float32Array(mesh_buffers, start_byte, nb_bones * 12);
    for (var i = 0; i < nb_bones; i++) {
      const start_idx = i * 16;
      pixelData[start_idx + 0] = deform[12 * i + 0];
      pixelData[start_idx + 1] = deform[12 * i + 3];
      pixelData[start_idx + 2] = deform[12 * i + 6];
      pixelData[start_idx + 3] = 0;
      pixelData[start_idx + 4] = deform[12 * i + 1];
      pixelData[start_idx + 5] = deform[12 * i + 4];
      pixelData[start_idx + 6] = deform[12 * i + 7];
      pixelData[start_idx + 7] = 0;
      pixelData[start_idx + 8] = deform[12 * i + 2];
      pixelData[start_idx + 9] = deform[12 * i + 5];
      pixelData[start_idx + 10] = deform[12 * i + 8];
      pixelData[start_idx + 11] = 0;
      pixelData[start_idx + 12] = deform[12 * i + 9];
      pixelData[start_idx + 13] = deform[12 * i + 10];
      pixelData[start_idx + 14] = deform[12 * i + 11];
      pixelData[start_idx + 15] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boneMatrixTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      4,
      this.max_bones,
      gl.RGBA,
      gl.FLOAT,
      pixelData
    );
    gl.uniform1i(this.boneMatrixImageLocation, 0);
    return pixelData;
  }
  seekNearestFirstFrame(idx, arrays) {
    const length = arrays.length;
    for (let i = 0; i < length - 1; ++i) {
      if (arrays[i] <= idx && arrays[i + 1] > idx) {
        return arrays[i];
      }
    }
    if (idx >= arrays[length - 1]) {
      return arrays[length - 1];
    }
  }
  loadNextBuffer() {
    if (freeArrayBuffers.length == 0) {
      if (keepAllMeshesInMemory) {
        return;
      }
      readyToPlay = true;
      if (onload) onload(false, true);
      return;
    }
    const bufferIndex = nextBufferLoadIndex;
    do {
      nextBufferLoadIndex = (nextBufferLoadIndex + 1) % jsonBuffers.length;
    } while (this.isBufferAlreadyLoaded(nextBufferLoadIndex));

    const buffer = jsonBuffers[bufferIndex];
    const bufferName = buffer.url;
    const bufferURL = urlRoot + "/" + bufferName;
    buffer.loaded = false;
    buffer.arrayBufferIndex = -1;
    const arrayBufferIndex = freeArrayBuffers.shift();
    pendingBufferDownload = true;
    this.loadArrayBuffer(
      bufferURL,
      function (arrayBuffer) {
        arrayBuffers[arrayBufferIndex] = arrayBuffer;
        arrayBuffer.bufferIndex = bufferIndex;
        buffer.arrayBufferIndex = arrayBufferIndex;
        buffer.loaded = true;
        pendingBufferDownload = false;
        this.loadNextBuffer();
      }.bind(this)
    );
  }
  loadArrayBuffer(url, callback) {
    const xobj = new XMLHttpRequest();
    xobj.name = url.substring(url.lastIndexOf("/") + 1, url.length);
    xobj.responseType = "arraybuffer";
    xobj.onprogress = (e) => {
      if (e.lengthComputable) {
        Math.floor((e.loaded / e.total) * 100);
      }
    };
    xobj.onreadystatechange = () => {
      if (xobj.readyState == 4) {
        if (xobj.status == 200) {
          const arrayBuffer = xobj.response;
          if (arrayBuffer && callback) {
            callback(arrayBuffer);
          }
        }
      }
    };
    xobj.ontimeout = () => {};
    xobj.open("GET", url, true);
    xobj.send(null);
  }
  isBufferAlreadyLoaded(bufferIndex) {
    for (let i = 0; i < arrayBuffers.length; ++i) {
      if (arrayBuffers[i] && arrayBuffers[i].bufferIndex == bufferIndex) {
        return true;
      }
    }
    return false;
  }
  checkLastAndCurrentBufferGap(lastIdx, currentIdx) {
    const totalLength = 3;
    const gap = new Array();
    if (lastIdx < currentIdx) {
      for (let i = lastIdx; i < currentIdx; i++) {
        gap.push(i);
      }
    } else {
      for (let i = lastIdx; i < currentIdx + totalLength; i++) {
        let val = i % totalLength;
        gap.push(val);
      }
    }
    return gap;
  }
  checkNextMeshReady() {
    let meshReady = true;
    for (
      let i = lastRenderFrameIndex + 1;
      i < lastRenderFrameIndex + nextRenderFrameCount;
      i++
    ) {
      const currentIdx = i % nb_frames;
      const arrayBufferIndex =
        jsonBuffers[mesh_frames[currentIdx].binFileIdx].arrayBufferIndex;
      if (arrayBufferIndex < 0) {
        meshReady = false;
        break;
      }
    }
    needRenderLastFrame = !meshReady;
    return meshReady;
  }
  play(visible = true) {
    last_time = new Date().getTime();
    videoPause = false;
    video.muted = false;
    this.mesh.visible = visible;
    if (this.dashPlayer) {
      this.dashPlayer.play();
    } else {
      try {
        const p = video.play();
        p.catch((e) => {
          console.log("1", e);
        });
      } catch (error) {
        console.log("1", error);
      }
    }
  }
  pause() {
    if (last_time) {
      videoPause = true;
      try {
        video.pause();
      } catch (error) {
        console.log("", error);
      }
    }
  }
}
export { mesh4DPlayer };

/**监听切换标签时,暂停播放 */
function listener(video) {
  window.onblur = function () {
    pause0(video);
  };
  window.onfocus = function () {
    play0(video);
  };
  document.addEventListener("visibilitychange", function () {
    const isHidden = document.hidden;
    console.log("显示还是隐藏", document.visibilityState);
    if (isHidden) {
      pause0(video);
    } else {
      play0(video);
    }
  });
}

function play0(video) {
  if (!mesh4DPlayer.listener) return;
  if (!video || !copyVideo || !time_) return;
  console.log("Go to the page Replay");
  last_time = new Date().getTime();
  videoPause = false;
  visibilitychange = false;
  video.muted = false;
  skipFrameCountInFirefox = 4;
  video.currentTime = time_;
  video.play();
  if (mesh_) mesh_.visible = true;
}
function pause0(video) {
  if (!mesh4DPlayer.listener) return;
  if (!video || !copyVideo) return;
  console.log("Leave page to stop playback");
  visibilitychange = true;
  videoPause = true;
  time_ = video.currentTime;
  video.currentTime = time_;
  skipFrameCountInFirefox = 0;
  video.pause();
}
