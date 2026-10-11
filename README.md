# 대구 태양광 탐지 결과 (NGII 정사영상 2025 × 딥러닝)

국토지리정보원 2025년 정사영상(25 cm, 대구 1:50,000 도엽 35803, 100매)에 태양광 패널 분할 모델(U-Net, ResNet-34)을 적용해 찾은 태양광 설비 결과를 보여 주는 정적 웹사이트입니다.

- 결과 포털: `index.html` — 요약, 모델 단계별 비교, 방법, 평가, 검증 사례, 탐지 갤러리, 시군구별 집계, 내려받기
- 지도 아틀라스: `atlas/` — 탐지 폴리곤, 1·2·3차 결과 전환, 신뢰도 필터, 검토(브라우저에만 저장)
- 정사영상 뷰어: `viewer/`

## 출처
- 정사영상: 국토지리정보원(NGII) 2025 정사영상 — 웹 타일(z10–18)로 변환
- 학습 데이터: Jiang et al. (2021) Multi-resolution dataset for photovoltaic panel segmentation, doi:10.5281/zenodo.5171712 (CC BY 4.0)
- 참고 레이어: Global Renewables Watch 2024Q2 (Microsoft·Planet·The Nature Conservancy, MIT)
- 행정경계: geoBoundaries (CC BY 4.0)
- 배경지도: Esri World Imagery, OpenStreetMap

추정 용량은 패널 면적 × 0.18 kWp/m²로 계산한 값이며, 재현율은 측정되지 않았습니다(하한에 가까운 추정).

## 배포
정사영상 타일(z10–18, 약 5.6만 개 파일)은 `tiles_pack/`에 tar 조각으로 들어 있고, `.github/workflows/pages.yml`이 배포 때 풀어서 GitHub Pages에 올립니다.
