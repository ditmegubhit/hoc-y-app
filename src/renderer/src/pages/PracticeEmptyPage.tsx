import { FolderPlus, FileText, MousePointerClick } from 'lucide-react'

// Man hinh trong cua khu Thuc hanh GP khi chua chon file nao.
function PracticeEmptyPage(): React.JSX.Element {
  return (
    <div className="practice-empty">
      <h2>Thực hành Giải Phẫu</h2>
      <p className="practice-empty-lead">
        Biến file PDF hình giải phẫu thành bài thi che nhãn: app quét sẵn các nhãn, bạn duyệt đáp án, rồi luyện tập hoặc
        thi thử.
      </p>
      <ol className="practice-empty-steps">
        <li>
          <FolderPlus size={16} />
          <span>Tạo thư mục để sắp xếp file (bấm &quot;Thư mục&quot; ở cột bên trái).</span>
        </li>
        <li>
          <FileText size={16} />
          <span>Thêm file PDF bằng nút &quot;Thêm file&quot; hoặc kéo thả từ Explorer vào cây.</span>
        </li>
        <li>
          <MousePointerClick size={16} />
          <span>Bấm vào một file để Tạo đáp án, Sửa đáp án, Tạo bài thi và Làm bài.</span>
        </li>
      </ol>
    </div>
  )
}

export default PracticeEmptyPage
