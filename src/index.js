import "./styles.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import CameraControls from "camera-controls";
CameraControls.install({ THREE: THREE });
import { mesh4DPlayer } from "./pmlib/webgl1/mesh4DPlayer1";
mesh4DPlayer.install(THREE);
let renderer, scene, camera, ambientlight, directionallight;
let cameraControls, gui;
let clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();
const baseUrl = "https://holodata.s3.cn-northwest-1.amazonaws.com.cn";
let meshPlayer;
init();

function init() {
  initrenderer();
  initcamera();
  initscene();
  initlight();
  initcontrols();
  render();
  initcontent();
}
async function initcontent() {
  const mesh_0 = await loaderModels("changjingtietu4.glb");
  // const mesh_2 = await loaderModels("icon/2.glb");
  // mesh_2.position.x = -2;
  // const mesh_1 = await loaderModels("icon/4.glb");
  // mesh_1.position.x = -3;
  await loaderModels("playBtnAni2.glb", "test");

  const urlRoot = baseUrl + "/AnimationData/businesscardProject/shao";
  meshPlayer = new mesh4DPlayer(renderer, {
    scene: scene,
    stream: false
  });
  mesh4DPlayer.listener = false;
  meshPlayer.load(urlRoot, (hologramMesh, ready) => {
    if (ready) {
      console.log("palyReady");
      // document.body.addEventListener("click", () => {
      //   console.log("palyStart");
      meshPlayer.play();
      // });
    } else if (hologramMesh) {
      scene.add(hologramMesh);
      console.log("add", hologramMesh);
    }
  });
}
function loaderModels(url, name) {
  const url_ = baseUrl + "/nameCardData/" + url;
  return new Promise((resolve, reject) => {
    gltfLoader.load(url_, (gltf) => {
      const mesh = gltf.scene;
      // mesh.scale.set(0.5, 0.5, 0.5);
      scene.add(mesh);
      resolve(mesh);
    });
  });
}
function initrenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0xffffff, 0.9);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
}
function initcamera() {
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    30000
  );
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
}
function initscene() {
  scene = new THREE.Scene();
  scene.add(new THREE.GridHelper(10, 10, 0x888888, 0x444444));
}
function initlight() {
  ambientlight = new THREE.AmbientLight(0x222222);
  ambientlight.name = "AmbientLight";
  scene.add(ambientlight);
  directionallight = new THREE.DirectionalLight(0xffffff, 1);
  directionallight.name = "DirectionalLight";
  directionallight.position.set(5, 10, 7.5);
  scene.add(directionallight);
}
function initcontrols() {
  cameraControls = new CameraControls(camera, renderer.domElement);
  window.addEventListener("resize", onWindowResize, false);
}
function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
}
function render() {
  const delta = clock.getDelta();
  const updated = cameraControls.update(delta);
  requestAnimationFrame(render);
  //	if ( updated ) {
  if (meshPlayer) meshPlayer.update();
  renderer.render(scene, camera);
  //}
}
